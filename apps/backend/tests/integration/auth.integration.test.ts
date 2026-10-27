import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import argon2 from 'argon2';
import { createApp } from '../../src/app.js';
import { authConfig } from '../../src/modules/auth/auth.config.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { authRuntime } from '../../src/modules/auth/auth.routes.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { authTestDatabase } from './auth-database.js';
import { developmentFingerprint } from './review-database.js';

let database: Awaited<ReturnType<typeof authTestDatabase>>;
let before: Awaited<ReturnType<typeof developmentFingerprint>>;
const origin = 'http://127.0.0.1:5173';
const password = randomBytes(24).toString('base64url');
const settings = {
  AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
  AUTH_CSRF_SECRET: randomBytes(32).toString('base64url'),
  AUTH_ORIGINS: origin,
  AUTH_COOKIE_SECURE: 'false',
  AUTH_ALLOW_LOCAL_HTTP: 'true',
};
beforeAll(async () => {
  before = await developmentFingerprint();
  database = await authTestDatabase();
});
afterAll(async () => {
  if (database) await database.dispose();
  expect(await developmentFingerprint()).toEqual(before);
});
function setup(secure = false) {
  const config = authConfig(
    secure
      ? {
          ...settings,
          AUTH_ORIGINS: 'https://helpdesk.example.invalid',
          AUTH_COOKIE_SECURE: 'true',
          AUTH_ALLOW_LOCAL_HTTP: 'false',
        }
      : settings,
    secure ? 'production' : 'test',
  );
  const service = new AuthService(new AuthRepository(database.db), config),
    runtime = authRuntime(service),
    app = createApp(runtime);
  return { app, service, runtime, agent: request.agent(app) };
}
type Client = ReturnType<typeof setup>;
async function token(client: Client) {
  const r = await client.agent.get('/auth/csrf').set('Origin', origin);
  expect(r.status).toBe(200);
  return r.body.csrfToken as string;
}
async function mutation(
  client: Client,
  path: string,
  body: Record<string, unknown> = {},
  method = 'post',
) {
  const csrf = await token(client);
  return method === 'patch'
    ? client.agent
        .patch(path)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send(body)
    : client.agent
        .post(path)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send(body);
}
function cookies(response: { headers: Record<string, unknown> }) {
  return (response.headers['set-cookie'] as string[])
    .map((c) => c.split(';')[0]!)
    .filter((c) => !c.endsWith('='));
}
async function register(client: Client) {
  const email = randomUUID() + '@example.invalid';
  const result = await mutation(client, '/auth/register', {
    name: 'Pessoa fictícia',
    email,
    password,
  });
  expect(result.status).toBe(201);
  return { email, user: result.body.user };
}
async function login(client: Client, email: string, secret = password) {
  return mutation(client, '/auth/login', { email, password: secret });
}

describe('DEV-003 autenticação real HTTP/PostgreSQL isolado', () => {
  it('não registra senhas, tokens ou chaves em logs de autenticação', async () => {
    const captured: unknown[][] = [];
    const spies = (['log', 'warn', 'error'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        captured.push(args);
      }),
    );
    try {
      const c = setup(),
        f = await register(c),
        response = await login(c, f.email);
      expect(response.status).toBe(200);
      await login(c, f.email, 'senha-incorreta-nao-registrar');
      await mutation(c, '/auth/logout');
      const output = JSON.stringify(captured);
      const sensitive = [
        password,
        settings.AUTH_JWT_SECRET,
        settings.AUTH_CSRF_SECRET,
        'senha-incorreta-nao-registrar',
        ...cookies(response).map((cookie) => cookie.split('=')[1]!),
      ];
      expect(sensitive.some((value) => output.includes(value))).toBe(false);
      expect(/passwordHash|tokenHash|\$argon2id\$/.test(output)).toBe(false);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
    }
  });
  it('cadastra REQUESTER normalizado, hash Argon2id e resposta sem segredos', async () => {
    const c = setup(),
      email = randomUUID() + '@example.invalid';
    const r = await mutation(c, '/auth/register', {
      name: ' Pessoa fictícia ',
      email: ' ' + email.toUpperCase() + ' ',
      password,
    });
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({
      email,
      role: 'REQUESTER',
      mustChangePassword: false,
    });
    expect(Object.keys(r.body.user).sort()).toEqual([
      'email',
      'id',
      'mustChangePassword',
      'name',
      'role',
    ]);
    const user = await database.db.user.findUniqueOrThrow({
      where: { id: r.body.user.id },
    });
    const parts = user.passwordHash.split('$');
    expect(parts[1]).toBe('argon2id');
    expect(parts[2]).toBe('v=19');
    expect(
      Object.fromEntries(parts[3]!.split(',').map((item) => item.split('='))),
    ).toEqual({ m: '19456', t: '2', p: '1' });
    expect(await argon2.verify(user.passwordHash, password)).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain(password);
  });
  it('não interpreta caracteres de e-mail como curingas SQL', async () => {
    const c = setup();
    await register(c);
    expect((await login(c, '%@example.invalid')).status).toBe(401);
  });
  it('recusa escolha de perfil e campos adicionais no cadastro', async () => {
    const c = setup();
    for (const role of ['ADMIN', 'TECHNICIAN']) {
      const r = await mutation(c, '/auth/register', {
        name: 'Teste',
        email: randomUUID() + '@example.invalid',
        password,
        role,
      });
      expect(r.status).toBe(400);
    }
  });
  it('recusa duplicidade inclusive diferenças de caixa, sem mensagem de existência de conta', async () => {
    const c = setup(),
      f = await register(c);
    const r = await mutation(c, '/auth/register', {
      name: 'Outra',
      email: f.email.toUpperCase(),
      password,
    });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('REGISTRATION_UNAVAILABLE');
    expect(r.body.error.message).toBe(
      'Não foi possível concluir o cadastro. Se você já possui uma conta, tente entrar ou entre em contato com o suporte.',
    );
    expect(r.body.error.message).not.toContain(f.email);
  });
  it('cadastros concorrentes preservam unicidade sem expor erro do Prisma', async () => {
    const a = setup(),
      b = setup(),
      email = randomUUID() + '@example.invalid';
    const send = (c: Client, value: string) =>
      mutation(c, '/auth/register', {
        name: 'Pessoa fictícia',
        email: value,
        password,
      });
    const results = await Promise.all([
      send(a, email),
      send(b, email.toUpperCase()),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await database.db.user.count({ where: { email } })).toBe(1);
    const failure = results.find((r) => r.status === 409)!;
    expect(failure.body.error.code).toBe('REGISTRATION_UNAVAILABLE');
    expect(JSON.stringify(failure.body)).not.toMatch(
      /P2002|Prisma|passwordHash/,
    );
  });
  it('valida política de 12 a 128 caracteres e e-mail', async () => {
    const c = setup();
    for (const p of ['curta', 'x'.repeat(129), '🙂'.repeat(6)])
      expect(
        (
          await mutation(c, '/auth/register', {
            name: 'Teste',
            email: randomUUID() + '@example.invalid',
            password: p,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await mutation(c, '/auth/register', {
          name: 'Teste',
          email: 'invalido',
          password,
        })
      ).status,
    ).toBe(400);
  });
  it('login cria sessão, cookies HttpOnly/Strict e guarda somente hash de refresh', async () => {
    const c = setup(),
      f = await register(c),
      r = await login(c, f.email.toUpperCase());
    expect(r.status).toBe(200);
    const headers = r.headers['set-cookie'] as unknown as string[];
    expect(
      headers
        .filter((h) => /helpdesk\.(access|refresh)=/.test(h))
        .every(
          (h) =>
            h.includes('HttpOnly') &&
            h.includes('SameSite=Strict') &&
            h.includes('Path=/'),
        ),
    ).toBe(true);
    expect(Object.keys(r.body)).toEqual(['user']);
    const refresh = cookies(r)
      .find((c) => c.startsWith('helpdesk.refresh='))!
      .split('=')[1]!;
    const row = await database.db.authRefreshToken.findFirstOrThrow({
      where: { session: { userId: f.user.id } },
    });
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).not.toBe(refresh);
    expect((await c.agent.get('/auth/me')).body.user.id).toBe(f.user.id);
  });
  it('senha incorreta, usuário inexistente e conta inativa têm a mesma resposta genérica', async () => {
    const c = setup(),
      f = await register(c);
    const wrong = await login(c, f.email, randomBytes(24).toString('hex'));
    const absent = await login(c, randomUUID() + '@example.invalid');
    await database.db.user.update({
      where: { id: f.user.id },
      data: { isActive: false },
    });
    const inactive = await login(c, f.email);
    for (const r of [wrong, absent, inactive]) {
      expect(r.status).toBe(401);
      expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
      expect(r.body.error.message).toBe(wrong.body.error.message);
    }
  });
  it('limita tentativas de login', async () => {
    const c = setup();
    for (let i = 0; i < 10; i++)
      expect((await login(c, randomUUID() + '@example.invalid')).status).toBe(
        401,
      );
    const r = await login(c, randomUUID() + '@example.invalid');
    expect(r.status).toBe(429);
    expect(r.headers['retry-after']).toBeDefined();
  });
  it('GET me exige JWT e sessão ativa e recusa deativação posterior', async () => {
    const c = setup();
    expect((await c.agent.get('/auth/me')).status).toBe(401);
    const f = await register(c);
    await login(c, f.email);
    await database.db.user.update({
      where: { id: f.user.id },
      data: { isActive: false },
    });
    expect((await c.agent.get('/auth/me')).status).toBe(401);
  });
  it('valida assinatura, emissor, audiência, tipo e expiração do JWT', async () => {
    const c = setup(),
      f = await register(c);
    await login(c, f.email);
    const session = await database.db.authSession.findFirstOrThrow({
      where: { userId: f.user.id },
    });
    const expired = await c.service.signAccess(
      f.user.id,
      session.id,
      new Date(Date.now() - 16 * 60000),
    );
    expect(
      (
        await request(c.app)
          .get('/auth/me')
          .set('Cookie', `helpdesk.access=${expired}`)
      ).status,
    ).toBe(401);
    for (const mode of ['signature', 'issuer', 'audience', 'type']) {
      const jwt = await new SignJWT({ sid: session.id })
        .setProtectedHeader({
          alg: 'HS256',
          typ: mode === 'type' ? 'JWT' : 'at+jwt',
        })
        .setSubject(f.user.id)
        .setJti(randomUUID())
        .setIssuedAt()
        .setExpirationTime('15m')
        .setIssuer(mode === 'issuer' ? 'other' : c.service.config.issuer)
        .setAudience(mode === 'audience' ? 'other' : c.service.config.audience)
        .sign(mode === 'signature' ? randomBytes(32) : c.service.config.jwtKey);
      expect(
        (
          await request(c.app)
            .get('/auth/me')
            .set('Cookie', `helpdesk.access=${jwt}`)
        ).status,
      ).toBe(401);
    }
  });
  it('refresh rotativo consome token anterior e reutilização revoga a família', async () => {
    const c = setup(),
      f = await register(c),
      first = await login(c, f.email);
    const firstRefresh = cookies(first).find((v) =>
      v.startsWith('helpdesk.refresh='),
    )!;
    const next = await mutation(c, '/auth/refresh');
    expect(next.status).toBe(200);
    const csrf = await token(c),
      csrfResponse = await c.agent.get('/auth/csrf').set('Origin', origin);
    const csrfCookie = cookies(csrfResponse).find((v) =>
      v.startsWith('helpdesk.csrf='),
    )!;
    const replay = await request(c.app)
      .post('/auth/refresh')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .set('Cookie', [firstRefresh, csrfCookie])
      .send({});
    expect(replay.status).toBe(401);
    expect((await c.agent.get('/auth/me')).status).toBe(401);
    expect(
      await database.db.authRefreshToken.count({
        where: { session: { userId: f.user.id } },
      }),
    ).toBe(2);
  });
  it('JWT expirado recupera acesso por refresh sem novo login', async () => {
    const c = setup(),
      f = await register(c),
      logged = await login(c, f.email);
    const session = await database.db.authSession.findFirstOrThrow({
      where: { userId: f.user.id },
    });
    const expired = await c.service.signAccess(
      f.user.id,
      session.id,
      new Date(Date.now() - 16 * 60000),
    );
    expect(
      (
        await request(c.app)
          .get('/auth/me')
          .set('Cookie', `helpdesk.access=${expired}`)
      ).status,
    ).toBe(401);
    const renewed = await mutation(c, '/auth/refresh');
    expect(renewed.status).toBe(200);
    expect(
      cookies(renewed).find((v) => v.startsWith('helpdesk.refresh=')),
    ).not.toBe(cookies(logged).find((v) => v.startsWith('helpdesk.refresh=')));
    expect((await c.agent.get('/auth/me')).body.user.id).toBe(f.user.id);
  });
  it('duas renovações concorrentes do mesmo token não criam duas sessões válidas', async () => {
    const c = setup(),
      f = await register(c),
      logged = await login(c, f.email),
      csrf = await token(c);
    const csrfResponse = await c.agent.get('/auth/csrf').set('Origin', origin);
    const jar = [
      ...cookies(logged).filter((v) => v.startsWith('helpdesk.refresh=')),
      ...cookies(csrfResponse),
    ];
    const send = () =>
      request(c.app)
        .post('/auth/refresh')
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .set('Cookie', jar)
        .send({});
    const results = await Promise.all([send(), send()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    const success = results.find((r) => r.status === 200)!;
    expect(
      (await request(c.app).get('/auth/me').set('Cookie', cookies(success)))
        .status,
    ).toBe(401);
  });
  it('logout revoga no servidor mesmo se o JWT antigo for reapresentado', async () => {
    const c = setup(),
      f = await register(c),
      logged = await login(c, f.email);
    expect((await mutation(c, '/auth/logout')).status).toBe(204);
    expect(
      (await request(c.app).get('/auth/me').set('Cookie', cookies(logged)))
        .status,
    ).toBe(401);
  });
  it('troca exige senha atual, aplica Argon2id e revoga todas as sessões', async () => {
    const c = setup(),
      other = setup(),
      f = await register(c);
    await login(c, f.email);
    const second = await login(other, f.email);
    const newPassword = randomBytes(24).toString('base64url');
    expect(
      (
        await mutation(
          c,
          '/auth/change-password',
          { currentPassword: 'incorreta', newPassword },
          'patch',
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await mutation(
          c,
          '/auth/change-password',
          { currentPassword: password, newPassword },
          'patch',
        )
      ).status,
    ).toBe(204);
    expect(
      (await request(c.app).get('/auth/me').set('Cookie', cookies(second)))
        .status,
    ).toBe(401);
    expect((await login(c, f.email)).status).toBe(401);
    expect((await login(c, f.email, newPassword)).status).toBe(200);
  });
  it('técnico com senha inicial só pode consultar sessão, trocar senha e sair', async () => {
    const c = setup(),
      email = randomUUID() + '@example.invalid';
    const user = await database.db.user.create({
      data: {
        name: 'Técnico de teste',
        email,
        role: 'TECHNICIAN',
        passwordHash: await hashPassword(password),
        mustChangePassword: true,
      },
    });
    const logged = await login(c, email);
    expect(logged.body.user.mustChangePassword).toBe(true);
    const probe = express();
    probe.use(c.runtime.http.origin);
    probe.get('/probe', c.runtime.http.authenticate(), (_req, res) => {
      res.json({ ok: true });
    });
    probe.use(errorHandler);
    expect(
      (await request(probe).get('/probe').set('Cookie', cookies(logged)))
        .status,
    ).toBe(403);
    expect(
      (
        await mutation(
          c,
          '/auth/change-password',
          {
            currentPassword: password,
            newPassword: randomBytes(24).toString('base64url'),
          },
          'patch',
        )
      ).status,
    ).toBe(204);
    expect(
      (await database.db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .mustChangePassword,
    ).toBe(false);
  });
  it('CSRF ausente, forjado e origem não autorizada são bloqueados', async () => {
    const c = setup();
    expect(
      (await c.agent.post('/auth/login').set('Origin', origin).send({})).status,
    ).toBe(403);
    await token(c);
    expect(
      (
        await c.agent
          .post('/auth/register')
          .set('Origin', origin)
          .set('X-CSRF-Token', 'forjado')
          .send({})
      ).status,
    ).toBe(403);
    expect((await c.agent.post('/auth/logout').send({})).status).toBe(403);
    const cross = await c.agent
      .get('/auth/csrf')
      .set('Origin', 'https://evil.example.invalid');
    expect(cross.status).toBe(403);
    expect(cross.headers['access-control-allow-origin']).toBeUndefined();
    const allowed = await c.agent
      .options('/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST');
    expect(allowed.status).toBe(204);
    expect(allowed.headers['access-control-allow-origin']).toBe(origin);
  });
  it('cookies Secure e prefixo Host são obrigatórios em HTTPS/produção', async () => {
    const c = setup(true);
    c.app.set('trust proxy', 'loopback');
    const r = await request(c.app)
      .get('/auth/csrf')
      .set('Origin', 'https://helpdesk.example.invalid')
      .set('X-Forwarded-Proto', 'https');
    expect(r.status).toBe(200);
    expect(
      (r.headers['set-cookie'] as unknown as string[]).every(
        (v) =>
          v.startsWith('__Host-') &&
          v.includes('Secure') &&
          v.includes('HttpOnly') &&
          !v.includes('Domain='),
      ),
    ).toBe(true);
    expect(
      (
        await request(c.app)
          .get('/auth/csrf')
          .set('Origin', 'https://helpdesk.example.invalid')
      ).status,
    ).toBe(403);
  });
  it('logout também revoga o JWT válido quando o cookie de refresh foi removido', async () => {
    const c = setup(),
      f = await register(c),
      logged = await login(c, f.email);
    const access = cookies(logged).find((v) =>
      v.startsWith('helpdesk.access='),
    )!;
    const context = await request(c.app)
      .get('/auth/csrf')
      .set('Origin', origin)
      .set('Cookie', access);
    const r = await request(c.app)
      .post('/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', context.body.csrfToken)
      .set('Cookie', [access, ...cookies(context)])
      .send({});
    expect(r.status).toBe(204);
    expect(
      (await request(c.app).get('/auth/me').set('Cookie', access)).status,
    ).toBe(401);
  });
  it('CSRF de uma sessão não autoriza alteração em outra sessão', async () => {
    const a = setup(),
      b = setup(),
      f = await register(a);
    await login(a, f.email);
    const logged = await login(b, f.email);
    const csrf = await token(a),
      csrfCookieResponse = await a.agent
        .get('/auth/csrf')
        .set('Origin', origin);
    const jar = [
      ...cookies(logged).filter((v) => v.startsWith('helpdesk.refresh=')),
      ...cookies(csrfCookieResponse),
    ];
    const r = await request(a.app)
      .post('/auth/logout')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .set('Cookie', jar)
      .send({});
    expect(r.status).toBe(403);
    expect((await b.agent.get('/auth/me')).status).toBe(200);
  });
  it('nega refresh desconhecido e expirado sem expor tokens ou hashes', async () => {
    const c = setup(),
      f = await register(c);
    await login(c, f.email);
    await database.db.authSession.updateMany({
      where: { userId: f.user.id },
      data: {
        expiresAt: new Date(Date.now() - 1000),
        createdAt: new Date(Date.now() - 10000),
      },
    });
    const r = await mutation(c, '/auth/refresh');
    expect(r.status).toBe(401);
    expect(JSON.stringify(r.body)).not.toMatch(
      /passwordHash|tokenHash|accessToken|refreshToken|argon2id/,
    );
  });
});
