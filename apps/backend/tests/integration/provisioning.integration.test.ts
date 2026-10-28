import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import express from 'express';
import request from 'supertest';
import { authTestDatabase } from './auth-database.js';
import { developmentFingerprint } from './review-database.js';
import {
  provisionDevelopment,
  provisionedIdentities,
  inspectProvisioning,
  provisioningSlots,
} from '../../src/modules/provisioning/development-provisioning.js';
import type { ProvisioningEntry } from '../../src/modules/provisioning/development-provisioning.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { authConfig } from '../../src/modules/auth/auth.config.js';
import { authRuntime } from '../../src/modules/auth/auth.routes.js';
import { authorization } from '../../src/modules/authorization/http.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';

let database: Awaited<ReturnType<typeof authTestDatabase>>;
let before: Awaited<ReturnType<typeof developmentFingerprint>>;
const plan = (): ProvisioningEntry[] =>
  provisioningSlots.map((slot) => ({
    slot: slot.key,
    name: slot.label,
    email: `${slot.key}-${randomUUID()}@example.invalid`,
    password: randomBytes(24).toString('base64url'),
  }));
beforeAll(async () => {
  before = await developmentFingerprint();
});
beforeEach(async () => {
  database = await authTestDatabase();
});
afterEach(async () => {
  if (database) await database.dispose();
});
afterAll(async () => {
  expect(await developmentFingerprint()).toEqual(before);
});
describe('HD-019 provisionamento real isolado', () => {
  it('cria administrador e três técnicos ativos com Argon2id e troca obrigatória', async () => {
    const input = plan(),
      result = await provisionDevelopment(database.db, input);
    expect(result.filter((row) => row.state === 'created')).toHaveLength(4);
    for (const slot of provisioningSlots) {
      const user = await database.db.user.findUniqueOrThrow({
        where: { id: slot.id },
      });
      expect(user.role).toBe(slot.role);
      expect(user.isActive).toBe(true);
      expect(user.mustChangePassword).toBe(true);
      expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
      expect(
        await argon2.verify(
          user.passwordHash,
          input.find((e) => e.slot === slot.key)!.password!,
        ),
      ).toBe(true);
    }
    expect(JSON.stringify(result)).not.toMatch(/password|Hash|token|email/);
    expect(
      (await provisionedIdentities(database.db)).every((row) => row.exists),
    ).toBe(true);
  });
  it('reexecução sem senhas não duplica, troca hashes, reativa ou redefine flags', async () => {
    const input = plan();
    await provisionDevelopment(database.db, input);
    await database.db.user.update({
      where: { id: provisioningSlots[1].id },
      data: {
        isActive: false,
        mustChangePassword: false,
        name: 'Nome alterado legitimamente',
      },
    });
    await database.db.user.update({
      where: { id: provisioningSlots[0].id },
      data: { mustChangePassword: false },
    });
    const original = JSON.stringify(
      await database.db.user.findMany({ orderBy: { id: 'asc' } }),
    );
    const identities = input.map(({ slot, name, email }) => ({
      slot,
      name,
      email,
    }));
    expect(
      (await inspectProvisioning(database.db, identities)).every(
        (row) => row.exists,
      ),
    ).toBe(true);
    expect(
      (await provisionDevelopment(database.db, identities)).every(
        (row) => row.state === 'preserved',
      ),
    ).toBe(true);
    expect(
      JSON.stringify(
        await database.db.user.findMany({ orderBy: { id: 'asc' } }),
      ) === original,
    ).toBe(true);
  });
  it('credenciais novas fornecidas em reexecução nunca substituem hashes existentes', async () => {
    const input = plan();
    await provisionDevelopment(database.db, input);
    const original = JSON.stringify(
      await database.db.user.findMany({ orderBy: { id: 'asc' } }),
    );
    await provisionDevelopment(
      database.db,
      input.map((row) => ({
        ...row,
        password: randomBytes(24).toString('base64url'),
      })),
    );
    expect(
      JSON.stringify(
        await database.db.user.findMany({ orderBy: { id: 'asc' } }),
      ) === original,
    ).toBe(true);
  });
  it('conflito com solicitante por e-mail é recusado sem promoção ou criação parcial', async () => {
    const input = plan(),
      email = input[2]!.email.toUpperCase();
    const existing = await database.db.user.create({
      data: {
        name: 'Solicitante preservado',
        email,
        role: 'REQUESTER',
        passwordHash: await hashPassword(randomBytes(24).toString('hex')),
      },
    });
    await expect(
      provisionDevelopment(database.db, input),
    ).rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
    expect(await database.db.user.count()).toBe(1);
    expect(
      JSON.stringify(
        await database.db.user.findUnique({ where: { id: existing.id } }),
      ) === JSON.stringify(existing),
    ).toBe(true);
  });
  it('perfil incompatível em identificador reservado nunca é convertido', async () => {
    const input = plan();
    await database.db.user.create({
      data: {
        id: provisioningSlots[0].id,
        name: 'Conta preexistente',
        email: input[0]!.email,
        role: 'REQUESTER',
        passwordHash: await hashPassword(randomBytes(24).toString('hex')),
      },
    });
    await expect(
      provisionDevelopment(database.db, input),
    ).rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
    expect(
      (
        await database.db.user.findUniqueOrThrow({
          where: { id: provisioningSlots[0].id },
        })
      ).role,
    ).toBe('REQUESTER');
    expect(await database.db.user.count()).toBe(1);
  });
  it('não cria outro administrador inicial quando já existe administrador de outra origem', async () => {
    await database.db.user.create({
      data: {
        name: 'Admin preexistente',
        email: 'outro@example.invalid',
        role: 'ADMIN',
        passwordHash: await hashPassword(randomBytes(24).toString('hex')),
      },
    });
    await expect(
      provisionDevelopment(database.db, plan()),
    ).rejects.toMatchObject({ code: 'PROVISIONING_CONFLICT' });
    expect(await database.db.user.count()).toBe(1);
  });
  it('recusa senhas compartilhadas, curtas, e-mails inválidos/duplicados e escolha de papel', async () => {
    const input = plan();
    for (const invalid of [
      input.map((row) => ({ ...row, password: input[0]!.password })),
      input.map((row) => ({ ...row, password: 'curta' })),
      input.map((row) => ({ ...row, email: 'email-invalido' })),
      input.map((row) => ({ ...row, email: input[0]!.email.toUpperCase() })),
      input.map((row) => ({ ...row, role: 'ADMIN' })),
    ])
      await expect(
        provisionDevelopment(database.db, invalid),
      ).rejects.toMatchObject({ code: 'PROVISIONING_INPUT' });
    expect(await database.db.user.count()).toBe(0);
  });
  it('falta de credencial em conta nova não deixa lote parcial', async () => {
    const input = plan();
    input[3]!.password = undefined;
    await expect(
      provisionDevelopment(database.db, input),
    ).rejects.toMatchObject({ code: 'PROVISIONING_INPUT' });
    expect(await database.db.user.count()).toBe(0);
  });
  it('falha na última inserção reverte as três inserções anteriores', async () => {
    // Static test-only constraint in the freshly-created disposable namespace.
    await database.db.$executeRawUnsafe(
      `ALTER TABLE users ADD CONSTRAINT fixture_reject_last CHECK(id <> '${provisioningSlots[3].id}'::uuid)`,
    );
    await expect(
      provisionDevelopment(database.db, plan()),
    ).rejects.toMatchObject({ code: 'PROVISIONING_UNAVAILABLE' });
    expect(await database.db.user.count()).toBe(0);
  });
  it('duas execuções concorrentes criam apenas quatro contas', async () => {
    const input = plan(),
      results = await Promise.all([
        provisionDevelopment(database.db, input),
        provisionDevelopment(database.db, input),
      ]);
    expect(
      results.flat().filter((row) => row.state === 'created'),
    ).toHaveLength(4);
    expect(
      results.flat().filter((row) => row.state === 'preserved'),
    ).toHaveLength(4);
    expect(await database.db.user.count()).toBe(4);
  });
  it('recusa execução fora do modo autorizado mesmo com conexão válida', async () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await expect(
        provisionDevelopment(database.db, plan()),
      ).rejects.toMatchObject({ code: 'PROVISIONING_TARGET' });
    } finally {
      process.env.NODE_ENV = previous;
    }
    expect(await database.db.user.count()).toBe(0);
  });
  it('login real força troca de senha em todos os perfis provisionados e revoga senha inicial', async () => {
    const input = plan();
    await provisionDevelopment(database.db, input);
    for (const entry of input) {
      const config = authConfig(
        {
          AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
          AUTH_CSRF_SECRET: randomBytes(32).toString('base64url'),
          AUTH_ORIGINS: 'http://127.0.0.1:5173',
          AUTH_COOKIE_SECURE: 'false',
          AUTH_ALLOW_LOCAL_HTTP: 'true',
        },
        'test',
      );
      const runtime = authRuntime(
        new AuthService(new AuthRepository(database.db), config),
      );
      const app = express();
      app.use(express.json());
      app.use('/auth', runtime.router);
      app.get(
        '/probe/common',
        ...authorization(runtime).permission('tickets.read'),
        (_req, res) => res.sendStatus(204),
      );
      app.use(errorHandler);
      const agent = request.agent(app),
        origin = 'http://127.0.0.1:5173';
      async function mutation(
        path: string,
        body: Record<string, unknown>,
        patch = false,
      ) {
        const csrf = await agent.get('/auth/csrf').set('Origin', origin);
        return (patch ? agent.patch(path) : agent.post(path))
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf.body.csrfToken)
          .send(body);
      }
      const login = () =>
        mutation('/auth/login', {
          email: entry.email,
          password: entry.password,
        });
      expect((await login()).body.user.mustChangePassword).toBe(true);
      expect((await agent.get('/probe/common')).status).toBe(403);
      expect(
        (
          await mutation(
            '/auth/change-password',
            { currentPassword: entry.password, newPassword: entry.password },
            true,
          )
        ).status,
      ).toBe(400);
      const newPassword = randomBytes(24).toString('base64url');
      expect(
        (
          await mutation(
            '/auth/change-password',
            { currentPassword: entry.password, newPassword },
            true,
          )
        ).status,
      ).toBe(204);
      expect((await login()).status).toBe(401);
      const changed = await mutation('/auth/login', {
        email: entry.email,
        password: newPassword,
      });
      expect(changed.status).toBe(200);
      expect(changed.body.user.mustChangePassword).toBe(false);
      expect((await agent.get('/probe/common')).status).toBe(204);
    }
  });
});
