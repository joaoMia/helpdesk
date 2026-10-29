import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  jest,
} from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { authTestDatabase } from './auth-database.js';
import { developmentFingerprint } from './review-database.js';
import { createApp } from '../../src/app.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { authConfig } from '../../src/modules/auth/auth.config.js';
import { authRuntime } from '../../src/modules/auth/auth.routes.js';
import { ProfileService } from '../../src/modules/users/profile.service.js';
import { ProfileRepository } from '../../src/modules/users/profile.repository.js';
import { hashPassword } from '../../src/modules/auth/password.js';
let database: Awaited<ReturnType<typeof authTestDatabase>>,
  before: Awaited<ReturnType<typeof developmentFingerprint>>;
const origin = 'http://127.0.0.1:5173',
  password = randomBytes(24).toString('base64url');
beforeAll(async () => {
  before = await developmentFingerprint();
});
beforeEach(async () => {
  database = await authTestDatabase();
});
afterEach(async () => {
  await database.dispose();
});
afterAll(async () => {
  expect(await developmentFingerprint()).toEqual(before);
});
function setup() {
  const repo = new AuthRepository(database.db);
  const service = new AuthService(
    repo,
    authConfig(
      {
        AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
        AUTH_CSRF_SECRET: randomBytes(32).toString('base64url'),
        AUTH_ORIGINS: origin,
        AUTH_COOKIE_SECURE: 'false',
        AUTH_ALLOW_LOCAL_HTTP: 'true',
      },
      'test',
    ),
  );
  const app = createApp(
    authRuntime(service),
    new ProfileService(new ProfileRepository(database.db)),
  );
  return { app, agent: request.agent(app), service, repo };
}
type Client = ReturnType<typeof setup>;
async function mutate(
  client: Client,
  url: string,
  body: unknown,
  patch = false,
) {
  const csrf = await client.agent.get('/auth/csrf').set('Origin', origin);
  return (patch ? client.agent.patch(url) : client.agent.post(url))
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send(body as object);
}
async function account(
  role: 'REQUESTER' | 'TECHNICIAN' | 'ADMIN' = 'REQUESTER',
) {
  return database.db.user.create({
    data: {
      name: 'Pessoa de teste',
      email: randomUUID() + '@example.invalid',
      role,
      passwordHash: await hashPassword(password),
    },
  });
}
async function logged(
  role: 'REQUESTER' | 'TECHNICIAN' | 'ADMIN' = 'REQUESTER',
) {
  const user = await account(role),
    client = setup();
  expect(
    (await mutate(client, '/auth/login', { email: user.email, password }))
      .status,
  ).toBe(200);
  return { user, client };
}
describe('HD-020 perfil real PostgreSQL', () => {
  it('login em andamento com e-mail antigo não recria sessão após alteração', async () => {
    const { user, client } = await logged();
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
        entered = resolve;
      }),
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    const original = client.repo.createSession.bind(client.repo);
    const spy = jest
      .spyOn(client.repo, 'createSession')
      .mockImplementation(async (...args) => {
        entered();
        await gate;
        return original(...args);
      });
    const pending = client.service.login({ email: user.email, password }).then(
      () => true,
      () => false,
    );
    await ready;
    try {
      expect(
        (
          await mutate(
            client,
            '/users/me',
            {
              email: randomUUID() + '@example.invalid',
              currentPassword: password,
            },
            true,
          )
        ).status,
      ).toBe(200);
    } finally {
      release();
      spy.mockRestore();
    }
    expect(await pending).toBe(false);
    expect(
      await database.db.authSession.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
  });
  it('consulta somente dados públicos próprios e persiste nome após logout/login', async () => {
    const { user, client } = await logged();
    const get = await client.agent.get('/users/me');
    expect(get.status).toBe(200);
    expect(get.body.user.id).toBe(user.id);
    expect(get.body.user).not.toHaveProperty('passwordHash');
    const updated = await mutate(
      client,
      '/users/me',
      { name: ' Nome atualizado ' },
      true,
    );
    expect(updated.status).toBe(200);
    expect(updated.body.user.name).toBe('Nome atualizado');
    expect(updated.body.reauthenticate).toBe(false);
    expect((await mutate(client, '/auth/logout', {})).status).toBe(204);
    expect(
      (await mutate(client, '/auth/login', { email: user.email, password }))
        .status,
    ).toBe(200);
    expect((await client.agent.get('/users/me')).body.user.name).toBe(
      'Nome atualizado',
    );
  });
  it('muda e-mail normalizado com senha e revoga todas as sessões', async () => {
    const { user, client } = await logged();
    const second = setup();
    await mutate(second, '/auth/login', { email: user.email, password });
    const email = 'new-' + randomUUID() + '@example.invalid';
    const response = await mutate(
      client,
      '/users/me',
      { email: ' ' + email.toUpperCase() + ' ', currentPassword: password },
      true,
    );
    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(email);
    expect(response.body.reauthenticate).toBe(true);
    expect(JSON.stringify(response.body).includes(password)).toBe(false);
    expect((await client.agent.get('/auth/me')).status).toBe(401);
    expect((await second.agent.get('/users/me')).status).toBe(401);
    expect((await mutate(second, '/auth/refresh', {})).status).toBe(401);
    expect(
      await database.db.authSession.count({
        where: { userId: user.id, revokedAt: null },
      }),
    ).toBe(0);
    const next = setup();
    expect(
      (await mutate(next, '/auth/login', { email: user.email, password }))
        .status,
    ).toBe(401);
    expect(
      (await mutate(next, '/auth/login', { email, password })).status,
    ).toBe(200);
  });
  it('recusa senha ausente ou incorreta sem modificar nome/e-mail/sessões', async () => {
    const { user, client } = await logged();
    for (const extra of [{}, { currentPassword: 'incorrect-password' }])
      expect(
        (
          await mutate(
            client,
            '/users/me',
            { name: 'Não salvar', email: 'new@example.invalid', ...extra },
            true,
          )
        ).status,
      ).toBe(403);
    expect(
      (await database.db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .name,
    ).toBe(user.name);
    expect((await client.agent.get('/users/me')).status).toBe(200);
  });
  it('e-mail duplicado ignora caixa e não expõe dados de terceiros', async () => {
    const { user, client } = await logged(),
      other = await account();
    const r = await mutate(
      client,
      '/users/me',
      { email: other.email.toUpperCase(), currentPassword: password },
      true,
    );
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body).includes(other.id)).toBe(false);
    expect(
      (await database.db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .email,
    ).toBe(user.email);
  });
  it('concorrência por mesmo e-mail produz um vencedor e nenhum overwrite', async () => {
    const a = await logged(),
      b = await logged(),
      email = randomUUID() + '@example.invalid';
    const responses = await Promise.all([
      mutate(a.client, '/users/me', { email, currentPassword: password }, true),
      mutate(b.client, '/users/me', { email, currentPassword: password }, true),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await database.db.user.count({ where: { email } })).toBe(1);
  });
  it('rejeita atributos privilegiados e tentativa de escolher outro usuário', async () => {
    const user = await account(),
      other = await account();
    for (const [key, value] of Object.entries({
      userId: other.id,
      id: other.id,
      role: 'ADMIN',
      isActive: false,
      passwordHash: 'invalid',
      mustChangePassword: false,
      updatedAt: '2020-01-01',
    })) {
      const c = setup();
      await mutate(c, '/auth/login', { email: user.email, password });
      expect(
        (
          await mutate(
            c,
            '/users/me',
            { name: 'Não salvar', [key]: value },
            true,
          )
        ).status,
      ).toBe(400);
    }
    expect(
      (await database.db.user.findUniqueOrThrow({ where: { id: other.id } }))
        .name,
    ).toBe(other.name);
  });
  it.each(['ADMIN', 'TECHNICIAN'] as const)(
    'respeita a edição própria de %s sem conceder poderes adicionais',
    async (role) => {
      const { client } = await logged(role);
      expect((await client.agent.get('/users/me')).status).toBe(200);
      expect(
        (await mutate(client, '/users/me', { name: 'Outra pessoa' }, true))
          .status,
      ).toBe(role === 'TECHNICIAN' ? 200 : 403);
    },
  );
  it('sem autenticação e URL de terceiros não abrem perfil', async () => {
    const c = setup();
    expect((await c.agent.get('/users/me')).status).toBe(401);
    const { client } = await logged();
    expect((await client.agent.get('/users/' + randomUUID())).status).toBe(404);
  });
  it('sessão revogada, conta inativa e troca obrigatória bloqueiam perfil', async () => {
    const { user, client } = await logged();
    await database.db.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });
    expect((await client.agent.get('/users/me')).status).toBe(403);
    await database.db.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false, isActive: false },
    });
    expect((await client.agent.get('/users/me')).status).toBe(401);
    await database.db.user.update({
      where: { id: user.id },
      data: { isActive: true },
    });
    await mutate(client, '/auth/logout', {});
    expect(
      (await mutate(client, '/users/me', { name: 'Não salvar' }, true)).status,
    ).toBe(401);
  });
  it('CSRF/origem não autorizada e limite de tentativas impedem gravação', async () => {
    const { client } = await logged();
    expect(
      (
        await client.agent
          .patch('/users/me')
          .set('Origin', origin)
          .send({ name: 'Não salvar' })
      ).status,
    ).toBe(403);
    expect(
      (
        await client.agent
          .patch('/users/me')
          .set('Origin', 'http://evil.invalid')
          .send({ name: 'Não salvar' })
      ).status,
    ).toBe(403);
    for (let i = 0; i < 5; i++)
      expect(
        (
          await mutate(
            client,
            '/users/me',
            {
              email: 'other@example.invalid',
              currentPassword: 'incorrect-password',
            },
            true,
          )
        ).status,
      ).toBe(403);
    expect(
      (await mutate(client, '/users/me', { name: 'Não salvar' }, true)).status,
    ).toBe(429);
  });
});
