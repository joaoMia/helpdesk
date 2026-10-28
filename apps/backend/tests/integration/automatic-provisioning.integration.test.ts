import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import argon2 from 'argon2';
import { authTestDatabase } from './auth-database.js';
import { developmentFingerprint } from './review-database.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import {
  automaticIdentities,
  provisionAutomatically,
} from '../../src/modules/provisioning/automatic-provisioning.js';
import type { PrepareCredentialDelivery } from '../../src/modules/provisioning/automatic-provisioning.js';
import { provisioningSlots } from '../../src/modules/provisioning/development-provisioning.js';
import { prepareProtectedCredentials } from '../../scripts/protected-credentials.js';

let database: Awaited<ReturnType<typeof authTestDatabase>>;
let before: Awaited<ReturnType<typeof developmentFingerprint>>;
let fixture: string | undefined;
beforeAll(async () => {
  before = await developmentFingerprint();
});
beforeEach(async () => {
  database = await authTestDatabase();
});
afterEach(async () => {
  if (database) await database.dispose();
  if (fixture) {
    if (!/[/\\]\.local[/\\]dev0051-acl-[a-f0-9]{32}$/.test(fixture))
      throw new Error('Unsafe fixture');
    rmSync(fixture, { recursive: true, force: true });
    fixture = undefined;
  }
});
afterAll(async () => {
  expect(await developmentFingerprint()).toEqual(before);
});

function deliveryMock() {
  const events: string[] = [];
  const prepare: PrepareCredentialDelivery = async () => {
    events.push('ready');
    expect(await database.db.user.count()).toBe(0);
    return {
      path: 'test-only-delivery',
      async finish(outcome) {
        events.push(outcome);
      },
    };
  };
  return { prepare, events };
}
describe('DEV-005.1 provisionamento automático real', () => {
  it('grava os quatro acessos com ACL real e persiste somente hashes Argon2id', async () => {
    fixture = path.join(
      fileURLToPath(new URL('../../../../.local/', import.meta.url)),
      `dev0051-acl-${randomUUID().replaceAll('-', '')}`,
    );
    const result = await provisionAutomatically(database.db, (entries) =>
      prepareProtectedCredentials(entries, fixture),
    );
    const bytes = readFileSync(result.path);
    try {
      const contents = bytes.toString('utf8');
      const passwords = [
        ...contents.matchAll(/Senha provisoria: ([A-Za-z0-9_-]{32})/g),
      ].map((m) => m[1]!);
      expect(passwords).toHaveLength(4);
      expect(new Set(passwords).size).toBe(4);
      for (const [index, identity] of automaticIdentities.entries()) {
        const user = await database.db.user.findUniqueOrThrow({
          where: { email: identity.email },
        });
        expect(user.name).toBe(identity.name);
        expect(user.role).toBe(provisioningSlots[index]!.role);
        expect(user.isActive && user.mustChangePassword).toBe(true);
        expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
        expect(await argon2.verify(user.passwordHash, passwords[index]!)).toBe(
          true,
        );
      }
      expect(result.summary.every((r) => r.state === 'created')).toBe(true);
      expect(!JSON.stringify(result).includes(passwords[0]!)).toBe(true);
    } finally {
      bytes.fill(0);
    }
  });
  it('falha de ACL/arquivo impede todos os INSERTs', async () => {
    await expect(
      provisionAutomatically(database.db, async () => {
        throw new Error('fixture delivery refusal');
      }),
    ).rejects.toMatchObject({ code: 'PROVISIONING_UNAVAILABLE' });
    expect(await database.db.user.count()).toBe(0);
  });
  it('falha SQL reverte o lote e solicita descarte do arquivo novo', async () => {
    await database.db.$executeRawUnsafe(
      `ALTER TABLE users ADD CONSTRAINT fixture_reject_auto CHECK(id <> '${provisioningSlots[3].id}'::uuid)`,
    );
    const delivery = deliveryMock();
    await expect(
      provisionAutomatically(database.db, delivery.prepare),
    ).rejects.toMatchObject({ code: 'PROVISIONING_UNAVAILABLE' });
    expect(delivery.events).toEqual(['ready', 'abort']);
    expect(await database.db.user.count()).toBe(0);
  });
  it('reexecução automática recusa sem regenerar acessos ou modificar contas', async () => {
    const first = deliveryMock();
    await provisionAutomatically(database.db, first.prepare);
    const original = JSON.stringify(
      await database.db.user.findMany({ orderBy: { id: 'asc' } }),
    );
    let prepared = false;
    await expect(
      provisionAutomatically(database.db, async () => {
        prepared = true;
        throw new Error();
      }),
    ).rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
    expect(prepared).toBe(false);
    expect(
      JSON.stringify(
        await database.db.user.findMany({ orderBy: { id: 'asc' } }),
      ) === original,
    ).toBe(true);
  });
  it('conflito de e-mail de solicitante não promove, sobrescreve ou prepara arquivo', async () => {
    await database.db.user.create({
      data: {
        name: 'Fixture preservada',
        email: automaticIdentities[2].email,
        role: 'REQUESTER',
        passwordHash: await hashPassword(randomUUID()),
      },
    });
    const original = JSON.stringify(await database.db.user.findMany());
    let prepared = false;
    await expect(
      provisionAutomatically(database.db, async () => {
        prepared = true;
        throw new Error();
      }),
    ).rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
    expect(prepared).toBe(false);
    expect(JSON.stringify(await database.db.user.findMany()) === original).toBe(
      true,
    );
  });
  it('corrida entre dois comandos entrega somente o lote que criou as contas', async () => {
    const first = deliveryMock(),
      second = deliveryMock();
    const results = await Promise.allSettled([
      provisionAutomatically(database.db, first.prepare),
      provisionAutomatically(database.db, second.prepare),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect([...first.events, ...second.events]).toEqual(['ready', 'commit']);
    expect(await database.db.user.count()).toBe(4);
  });
  it('arquivo existente recusa criação sem alterar arquivo ou banco', async () => {
    fixture = path.join(
      fileURLToPath(new URL('../../../../.local/', import.meta.url)),
      `dev0051-acl-${randomUUID().replaceAll('-', '')}`,
    );
    const { automaticPlan } =
      await import('../../src/modules/provisioning/automatic-provisioning.js');
    const existing = await prepareProtectedCredentials(
      automaticPlan(),
      fixture,
    );
    await existing.finish('commit');
    const original = readFileSync(existing.path);
    await expect(
      provisionAutomatically(database.db, (entries) =>
        prepareProtectedCredentials(entries, fixture),
      ),
    ).rejects.toMatchObject({ code: 'PROTECTED_DELIVERY' });
    expect(existsSync(existing.path)).toBe(true);
    expect(readFileSync(existing.path).equals(original)).toBe(true);
    expect(await database.db.user.count()).toBe(0);
    original.fill(0);
  });
});
