import {
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  describe,
  it,
  expect,
} from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import argon2 from 'argon2';
import { authTestDatabase } from './auth-database.js';
import { developmentFingerprint } from './review-database.js';
import { createApp } from '../../src/app.js';
import { authConfig } from '../../src/modules/auth/auth.config.js';
import { authRuntime } from '../../src/modules/auth/auth.routes.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { ProfileService } from '../../src/modules/users/profile.service.js';
import { ProfileRepository } from '../../src/modules/users/profile.repository.js';
import { TechnicianService } from '../../src/modules/technicians/technician.service.js';
import { TechnicianRepository } from '../../src/modules/technicians/technician.repository.js';
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
  const runtime = authRuntime(
    new AuthService(
      new AuthRepository(database.db),
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
    ),
  );
  const app = createApp(
    runtime,
    new ProfileService(new ProfileRepository(database.db)),
    new TechnicianService(new TechnicianRepository(database.db)),
  );
  return { app, agent: request.agent(app) };
}
type Client = ReturnType<typeof setup>;
async function mutate(c: Client, url: string, body: unknown, patch = false) {
  const csrf = await c.agent.get('/auth/csrf').set('Origin', origin);
  return (patch ? c.agent.patch(url) : c.agent.post(url))
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send(body as object);
}
async function account(role: 'ADMIN' | 'TECHNICIAN' | 'REQUESTER' = 'ADMIN') {
  return database.db.user.create({
    data: {
      name: 'Pessoa fictícia',
      email: randomUUID() + '@example.invalid',
      role,
      passwordHash: await hashPassword(password),
    },
  });
}
async function logged(role: 'ADMIN' | 'TECHNICIAN' | 'REQUESTER' = 'ADMIN') {
  const user = await account(role),
    c = setup();
  expect(
    (await mutate(c, '/auth/login', { email: user.email, password })).status,
  ).toBe(200);
  return { c, user };
}
const input = () => ({
  name: 'Técnico de teste',
  email: randomUUID() + '@example.invalid',
});
describe('HD-021 gestão real de técnicos', () => {
  it('ADMIN lista somente técnicos com paginação/busca e detalhes sem segredos', async () => {
    const { c } = await logged(),
      a = await account('TECHNICIAN');
    await account('REQUESTER');
    await account('TECHNICIAN');
    const list = await c.agent.get('/technicians?page=1&pageSize=1');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(2);
    expect(list.body.items).toHaveLength(1);
    expect(JSON.stringify(list.body).includes('password')).toBe(false);
    const found = await c.agent.get(
      '/technicians?search=' + encodeURIComponent(a.email),
    );
    expect(found.body.total).toBe(1);
    expect(found.body.items[0].id).toBe(a.id);
    const detail = await c.agent.get('/technicians/' + a.id);
    expect(detail.status).toBe(200);
    expect(detail.body.technician.isActive).toBe(true);
    expect(detail.body.technician.createdAt).toBeDefined();
    expect(detail.body.technician.passwordHash).toBeUndefined();
    expect(detail.body.technician.temporaryPassword).toBeUndefined();
  });
  it('cria senha individual Argon2id, força troca, não expõe novamente e permite novo login', async () => {
    const { c } = await logged(),
      data = input();
    data.email = data.email.toUpperCase();
    const created = await mutate(c, '/technicians', data);
    expect(created.status).toBe(201);
    expect(created.headers['cache-control']).toBe('no-store');
    const secret = created.body.temporaryPassword as string;
    expect(typeof secret === 'string' && secret.length === 32).toBe(true);
    const user = await database.db.user.findUniqueOrThrow({
      where: { id: created.body.technician.id },
    });
    expect(user.role).toBe('TECHNICIAN');
    expect(user.email).toBe(data.email.toLowerCase());
    expect(user.mustChangePassword && user.isActive).toBe(true);
    expect(user.passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await argon2.verify(user.passwordHash, secret)).toBe(true);
    expect(
      (await c.agent.get('/technicians/' + user.id)).body.technician
        .temporaryPassword,
    ).toBeUndefined();
    const tech = setup();
    expect(
      (
        await mutate(tech, '/auth/login', {
          email: user.email,
          password: secret,
        })
      ).status,
    ).toBe(200);
    expect((await tech.agent.get('/users/me')).status).toBe(403);
    expect(
      (
        await mutate(
          tech,
          '/auth/change-password',
          { currentPassword: secret, newPassword: secret },
          true,
        )
      ).status,
    ).toBe(400);
    const next = randomBytes(24).toString('base64url');
    expect(
      (
        await mutate(
          tech,
          '/auth/change-password',
          { currentPassword: secret, newPassword: next },
          true,
        )
      ).status,
    ).toBe(204);
    expect((await tech.agent.get('/auth/me')).status).toBe(401);
    expect(
      (await mutate(tech, '/auth/login', { email: user.email, password: next }))
        .status,
    ).toBe(200);
    expect((await tech.agent.get('/users/me')).status).toBe(200);
    const second = await mutate(c, '/technicians', input());
    expect(second.status).toBe(201);
    expect(second.body.temporaryPassword !== secret).toBe(true);
  });
  it('ADMIN edita nome sem alterar credencial e troca e-mail revogando sessões', async () => {
    const { c } = await logged(),
      tech = await logged('TECHNICIAN');
    const original = tech.user;
    const changed = await mutate(
      c,
      '/technicians/' + original.id,
      { name: 'Nome editado' },
      true,
    );
    expect(changed.status).toBe(200);
    expect((await tech.c.agent.get('/users/me')).status).toBe(200);
    const email = randomUUID() + '@example.invalid';
    expect(
      (
        await mutate(
          c,
          '/technicians/' + original.id,
          { email: email.toUpperCase() },
          true,
        )
      ).status,
    ).toBe(200);
    expect((await tech.c.agent.get('/users/me')).status).toBe(401);
    const after = await database.db.user.findUniqueOrThrow({
      where: { id: original.id },
    });
    expect(after.passwordHash === original.passwordHash).toBe(true);
    expect(after.role).toBe('TECHNICIAN');
    expect(after.email).toBe(email);
    expect(after.mustChangePassword).toBe(original.mustChangePassword);
    const fresh = setup();
    expect(
      (await mutate(fresh, '/auth/login', { email: original.email, password }))
        .status,
    ).toBe(401);
    expect(
      (await mutate(fresh, '/auth/login', { email, password })).status,
    ).toBe(200);
  });
  it('duplicidade, inclusive concorrente e com caixa diferente, é recusada', async () => {
    const { c } = await logged(),
      other = await account('REQUESTER');
    expect(
      (
        await mutate(c, '/technicians', {
          name: 'Não salvar',
          email: other.email.toUpperCase(),
        })
      ).status,
    ).toBe(409);
    const data = input(),
      r = await Promise.all([
        mutate(c, '/technicians', data),
        mutate(c, '/technicians', data),
      ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
    const tech = await account('TECHNICIAN');
    expect(
      (await mutate(c, '/technicians/' + tech.id, { email: other.email }, true))
        .status,
    ).toBe(409);
  });
  it.each(['REQUESTER', 'TECHNICIAN'] as const)(
    '%s não administra técnicos nem por headers falsificados',
    async (role) => {
      const { c } = await logged(role),
        target = await account('TECHNICIAN');
      expect(
        (await c.agent.get('/technicians').set('X-Role', 'ADMIN')).status,
      ).toBe(403);
      expect((await c.agent.get('/technicians/' + target.id)).status).toBe(403);
      expect((await mutate(c, '/technicians', input())).status).toBe(403);
      expect(
        (
          await mutate(
            c,
            '/technicians/' + target.id,
            { name: 'Não salvar' },
            true,
          )
        ).status,
      ).toBe(403);
    },
  );
  it('contratos estritos rejeitam atributos privilegiados e não atualizam outros perfis', async () => {
    const { c, user } = await logged(),
      tech = await account('TECHNICIAN'),
      requester = await account('REQUESTER');
    for (const field of [
      'role',
      'isActive',
      'passwordHash',
      'mustChangePassword',
      'id',
    ]) {
      expect(
        (await mutate(c, '/technicians', { ...input(), [field]: 'forged' }))
          .status,
      ).toBe(400);
      expect(
        (
          await mutate(
            c,
            '/technicians/' + tech.id,
            { name: 'Não salvar', [field]: 'forged' },
            true,
          )
        ).status,
      ).toBe(400);
    }
    for (const id of [user.id, requester.id, randomUUID()]) {
      expect((await c.agent.get('/technicians/' + id)).status).toBe(404);
      expect(
        (await mutate(c, '/technicians/' + id, { name: 'Não salvar' }, true))
          .status,
      ).toBe(404);
    }
    expect((await c.agent.get('/technicians?role=ADMIN')).status).toBe(400);
  });
  it('técnico edita próprio perfil com senha, sem editar terceiros ou liberar ADMIN', async () => {
    const tech = await logged('TECHNICIAN');
    expect(
      (await mutate(tech.c, '/users/me', { name: 'Meu nome' }, true)).status,
    ).toBe(200);
    const email = randomUUID() + '@example.invalid';
    expect(
      (
        await mutate(
          tech.c,
          '/users/me',
          { email, currentPassword: 'invalid' },
          true,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await mutate(
          tech.c,
          '/users/me',
          { email, currentPassword: password },
          true,
        )
      ).status,
    ).toBe(200);
    expect((await tech.c.agent.get('/auth/me')).status).toBe(401);
    const admin = await logged();
    expect(
      (await mutate(admin.c, '/users/me', { name: 'Admin' }, true)).status,
    ).toBe(403);
  });
  it('sem sessão, conta inativa, revogação ou senha pendente bloqueiam gestão', async () => {
    expect((await setup().agent.get('/technicians')).status).toBe(401);
    const { c, user } = await logged();
    await database.db.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });
    expect((await c.agent.get('/technicians')).status).toBe(403);
    await database.db.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false, isActive: false },
    });
    expect((await c.agent.get('/technicians')).status).toBe(401);
    await database.db.user.update({
      where: { id: user.id },
      data: { isActive: true },
    });
    await mutate(c, '/auth/logout', {});
    expect((await c.agent.get('/technicians')).status).toBe(401);
  });
  it('CSRF e origem são obrigatórios; métodos de exclusão/atividade/reset não existem', async () => {
    const { c } = await logged(),
      target = await account('TECHNICIAN');
    expect(
      (await c.agent.post('/technicians').set('Origin', origin).send(input()))
        .status,
    ).toBe(403);
    expect(
      (
        await c.agent
          .post('/technicians')
          .set('Origin', 'http://evil.invalid')
          .send(input())
      ).status,
    ).toBe(403);
    expect((await c.agent.delete('/technicians/' + target.id)).status).toBe(
      404,
    );
    expect(
      (await mutate(c, '/technicians/' + target.id + '/reset', {})).status,
    ).toBe(404);
  });
});
