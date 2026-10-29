import { beforeEach, afterEach, describe, it, expect } from '@jest/globals';
import { randomUUID, randomBytes } from 'node:crypto';
import { authTestDatabase } from './auth-database.js';
import {
  selectRequester,
  resetRequester,
} from '../../src/modules/users/requester-reset.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { authConfig } from '../../src/modules/auth/auth.config.js';
let db: Awaited<ReturnType<typeof authTestDatabase>>;
const oldPassword = randomBytes(24).toString('base64url'),
  newPassword = randomBytes(24).toString('base64url');
beforeEach(async () => {
  db = await authTestDatabase();
});
afterEach(async () => {
  await db.dispose();
});
async function user(role: 'REQUESTER' | 'ADMIN' | 'TECHNICIAN' = 'REQUESTER') {
  return db.db.user.create({
    data: {
      name: 'Fixture local',
      email: randomUUID() + '@example.invalid',
      role,
      passwordHash: await hashPassword(oldPassword),
    },
  });
}
function auth() {
  return new AuthService(
    new AuthRepository(db.db),
    authConfig(
      {
        AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
        AUTH_CSRF_SECRET: randomBytes(32).toString('base64url'),
        AUTH_ORIGINS: 'http://127.0.0.1:5173',
        AUTH_COOKIE_SECURE: 'false',
        AUTH_ALLOW_LOCAL_HTTP: 'true',
      },
      'test',
    ),
  );
}
describe('DEV-006.1 recuperação local isolada', () => {
  it('redefine hash, revoga todas as sessões, permite novo login e preserva demais campos/usuários', async () => {
    const owner = await user(),
      other = await user(),
      admin = await user('ADMIN'),
      tech = await user('TECHNICIAN'),
      service = auth();
    const first = await service.login({
      email: owner.email,
      password: oldPassword,
    });
    await service.login({ email: owner.email, password: oldPassword });
    const selected = await selectRequester(db.db, owner.email.toUpperCase());
    await resetRequester(db.db, selected, newPassword, newPassword);
    const after = await db.db.user.findUniqueOrThrow({
      where: { id: owner.id },
    });
    expect(
      JSON.stringify({ ...after, passwordHash: owner.passwordHash }) ===
        JSON.stringify(owner),
    ).toBe(true);
    for (const original of [other, admin, tech])
      expect(
        JSON.stringify(
          await db.db.user.findUnique({ where: { id: original.id } }),
        ) === JSON.stringify(original),
      ).toBe(true);
    expect(
      await db.db.authSession.count({
        where: { userId: owner.id, revokedAt: null },
      }),
    ).toBe(0);
    await expect(service.authenticate(first.accessToken)).rejects.toMatchObject(
      { code: 'SESSION_INVALID' },
    );
    await expect(
      service.login({ email: owner.email, password: oldPassword }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(
      (await service.login({ email: owner.email, password: newPassword })).user
        .id,
    ).toBe(owner.id);
  });
  it('senha curta e confirmação incorreta não alteram o registro', async () => {
    const original = await user(),
      selected = await selectRequester(db.db, original.email);
    for (const [password, confirmation] of [
      ['curta', 'curta'],
      [newPassword, oldPassword],
    ])
      await expect(
        resetRequester(db.db, selected, password!, confirmation!),
      ).rejects.toMatchObject({ code: 'RESET_INPUT' });
    expect(
      JSON.stringify(
        await db.db.user.findUnique({ where: { id: original.id } }),
      ) === JSON.stringify(original),
    ).toBe(true);
  });
  it('recusa usuário inexistente e inativo', async () => {
    await expect(
      selectRequester(db.db, 'missing@example.invalid'),
    ).rejects.toMatchObject({ code: 'RESET_BLOCKED' });
    const original = await user();
    await db.db.user.update({
      where: { id: original.id },
      data: { isActive: false },
    });
    await expect(selectRequester(db.db, original.email)).rejects.toMatchObject({
      code: 'RESET_BLOCKED',
    });
  });
  it.each(['ADMIN', 'TECHNICIAN'] as const)(
    'não seleciona nem altera %s mesmo com snapshot fabricado',
    async (role) => {
      const original = await user(role);
      await expect(
        selectRequester(db.db, original.email),
      ).rejects.toMatchObject({ code: 'RESET_BLOCKED' });
      await expect(
        resetRequester(db.db, original, newPassword, newPassword),
      ).rejects.toMatchObject({ code: 'RESET_BLOCKED' });
      expect(
        JSON.stringify(
          await db.db.user.findUnique({ where: { id: original.id } }),
        ) === JSON.stringify(original),
      ).toBe(true);
    },
  );
  it('recusa modo production antes de selecionar ou escrever', async () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      await expect(
        selectRequester(db.db, 'test@example.invalid'),
      ).rejects.toMatchObject({ code: 'PROVISIONING_TARGET' });
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
  it('revalida mudanças concorrentes e apenas um reset com snapshot antigo vence', async () => {
    const original = await user(),
      selected = await selectRequester(db.db, original.email);
    const results = await Promise.allSettled([
      resetRequester(db.db, selected, newPassword, newPassword),
      resetRequester(db.db, selected, oldPassword, oldPassword),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('falha na revogação reverte também o novo hash', async () => {
    const original = await user();
    await auth().login({ email: original.email, password: oldPassword });
    await db.db.$executeRawUnsafe(
      "ALTER TABLE auth_sessions ADD CONSTRAINT fixture_reset_failure CHECK(revoke_reason IS DISTINCT FROM 'DEV_REQUESTER_PASSWORD_RESET')",
    );
    await expect(
      resetRequester(
        db.db,
        await selectRequester(db.db, original.email),
        newPassword,
        newPassword,
      ),
    ).rejects.toMatchObject({ code: 'RESET_FAILED' });
    expect(
      JSON.stringify(
        await db.db.user.findUnique({ where: { id: original.id } }),
      ) === JSON.stringify(original),
    ).toBe(true);
    expect(
      await db.db.authSession.count({
        where: { userId: original.id, revokedAt: null },
      }),
    ).toBe(1);
  });
});
