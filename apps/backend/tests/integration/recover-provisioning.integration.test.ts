import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { authTestDatabase } from './auth-database.js';
import { automaticPlan } from '../../src/modules/provisioning/automatic-provisioning.js';
import {
  provisionDevelopment,
  provisioningSlots,
} from '../../src/modules/provisioning/development-provisioning.js';
import { recoverProvisioning } from '../../src/modules/provisioning/recover-provisioning.js';
let database: Awaited<ReturnType<typeof authTestDatabase>>;
beforeEach(async () => {
  database = await authTestDatabase();
  await provisionDevelopment(database.db, automaticPlan());
});
afterEach(async () => {
  await database.dispose();
});
const denied = async () => {
  throw new Error('delivery must not execute');
};
describe('DEV-005.2 recuperação isolada', () => {
  it('redefine somente hashes elegíveis após entrega protegida, sem criar usuários', async () => {
    const before = await database.db.user.findMany({ orderBy: { id: 'asc' } });
    let matches = false;
    await recoverProvisioning(database.db, async (entries) => ({
      path: 'test-only',
      async finish() {
        const after = await database.db.user.findMany({
          orderBy: { id: 'asc' },
        });
        matches = (
          await Promise.all(
            after.map((u, i) =>
              argon2.verify(u.passwordHash, entries[i]!.password!),
            ),
          )
        ).every(Boolean);
      },
    }));
    const after = await database.db.user.findMany({ orderBy: { id: 'asc' } });
    expect(matches).toBe(true);
    expect(after).toHaveLength(4);
    expect(
      after.every(
        (u, i) =>
          u.email === before[i]!.email &&
          u.role === before[i]!.role &&
          u.name === before[i]!.name &&
          u.mustChangePassword,
      ),
    ).toBe(true);
  });
  it('bloqueia troca concluída e preserva todo o lote', async () => {
    await database.db.user.update({
      where: { id: provisioningSlots[0].id },
      data: { mustChangePassword: false },
    });
    const before = JSON.stringify(
      await database.db.user.findMany({ orderBy: { id: 'asc' } }),
    );
    await expect(
      recoverProvisioning(database.db, denied),
    ).rejects.toMatchObject({ code: 'RECOVERY_BLOCKED' });
    expect(
      JSON.stringify(
        await database.db.user.findMany({ orderBy: { id: 'asc' } }),
      ) === before,
    ).toBe(true);
  });
  it('bloqueia sessão ativa sem revogá-la', async () => {
    const session = await database.db.authSession.create({
      data: {
        id: randomUUID(),
        userId: provisioningSlots[2].id,
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    await expect(
      recoverProvisioning(database.db, denied),
    ).rejects.toMatchObject({ code: 'RECOVERY_BLOCKED' });
    expect(
      (
        await database.db.authSession.findUniqueOrThrow({
          where: { id: session.id },
        })
      ).revokedAt,
    ).toBeNull();
  });
  it('falha de arquivo reverte qualquer alteração de senha', async () => {
    const before = JSON.stringify(
      await database.db.user.findMany({ orderBy: { id: 'asc' } }),
    );
    await expect(
      recoverProvisioning(database.db, denied),
    ).rejects.toMatchObject({ code: 'RECOVERY_FAILED' });
    expect(
      JSON.stringify(
        await database.db.user.findMany({ orderBy: { id: 'asc' } }),
      ) === before,
    ).toBe(true);
  });
});
