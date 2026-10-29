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
import { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import { CatalogRepository } from '../../src/modules/catalog/catalog.repository.js';
import { TicketApiService } from '../../src/modules/tickets/ticket-api.service.js';
import { TicketApiRepository } from '../../src/modules/tickets/ticket-api.repository.js';
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
    undefined,
    new CatalogService(new CatalogRepository(database.db)),
    new TicketApiService(new TicketApiRepository(database.db)),
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

async function fixture() {
  const admin = await logged('ADMIN'),
    requester = await logged('REQUESTER');
  const cat = await mutate(admin.c, '/categories', { name: 'Suporte isolado' });
  expect(cat.status).toBe(201);
  const service = await mutate(admin.c, '/services', {
    name: 'Serviço básico',
    categoryId: cat.body.item.id,
  });
  expect(service.status).toBe(201);
  return {
    admin,
    requester,
    cat: cat.body.item,
    service: service.body.item,
    input: {
      serviceId: service.body.item.id,
      subject: 'Solicitação de teste',
      description: 'Descrição para persistência isolada',
    },
  };
}
async function create(f: Awaited<ReturnType<typeof fixture>>) {
  const response = await mutate(f.requester.c, '/tickets', f.input);
  expect(response.status).toBe(201);
  return response.body.ticket;
}
describe('BLOCO 01: abertura e consulta HTTP reais', () => {
  it('revalida dentro da transação uma sessão revogada após autenticação', async () => {
    const f = await fixture(),
      u = f.requester.user;
    const session = await database.db.authSession.findFirstOrThrow({
      where: { userId: u.id, revokedAt: null },
    });
    const identity = {
      sessionId: session.id,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        mustChangePassword: u.mustChangePassword,
      },
    };
    await database.db.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokeReason: 'TEST_REVOKED' },
    });
    const service = new TicketApiService(new TicketApiRepository(database.db));
    await expect(service.open(identity, f.input)).rejects.toMatchObject({
      code: 'SESSION_INVALID',
    });
    expect(await database.db.ticket.count()).toBe(0);
    expect(await database.db.ticketEvent.count()).toBe(0);
  });
  it('REQUESTER abre com sessão real, serviço único, snapshot e evento transacionais', async () => {
    const f = await fixture(),
      response = await mutate(f.requester.c, '/tickets', f.input);
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.location).toBe(
      '/tickets/' + response.body.ticket.id,
    );
    const saved = await database.db.ticket.findUniqueOrThrow({
      where: { id: response.body.ticket.id },
      include: { events: true, answers: true },
    });
    expect(saved.requesterId).toBe(f.requester.user.id);
    expect(saved.status).toBe('OPEN');
    expect(saved.priority).toBeNull();
    expect(saved.assignedTechnicianId).toBeNull();
    expect(saved.serviceId).toBe(f.service.id);
    expect(saved.serviceSnapshot).toMatchObject({
      serviceId: f.service.id,
      serviceName: f.service.name,
      categoryId: f.cat.id,
      categoryName: f.cat.name,
      formVersion: 1,
      fields: [],
    });
    expect(saved.answers).toHaveLength(0);
    expect(saved.events).toHaveLength(1);
    expect(saved.events[0]!.eventType).toBe('OPENED');
    const detail = await f.requester.c.agent.get('/tickets/' + saved.id);
    expect(detail.status).toBe(200);
    expect(detail.body.ticket.subject).toBe(f.input.subject);
    expect(detail.body.ticket.serviceSnapshot).toEqual(
      response.body.ticket.serviceSnapshot,
    );
    expect(detail.body.ticket.passwordHash).toBeUndefined();
  });
  it('listagem, filtros e totais são limitados aos próprios chamados', async () => {
    const f = await fixture(),
      a = await create(f),
      other = await logged('REQUESTER');
    const second = await mutate(other.c, '/tickets', {
      ...f.input,
      subject: 'Segredo de outro solicitante',
    });
    expect(second.status).toBe(201);
    const list = await f.requester.c.agent.get(
      '/tickets?pageSize=1&status=OPEN&priority=NONE',
    );
    expect(list.body.total).toBe(1);
    expect(list.body.items.map((t: { id: string }) => t.id)).toEqual([a.id]);
    expect(JSON.stringify(list.body).includes('Segredo de outro')).toBe(false);
    expect(
      (await f.requester.c.agent.get('/tickets?search=HD-' + a.code)).body
        .total,
    ).toBe(1);
    expect(
      (await f.requester.c.agent.get('/tickets?search=inexistente')).body.total,
    ).toBe(0);
    expect(
      (await f.requester.c.agent.get('/tickets?serviceId=' + f.service.id)).body
        .total,
    ).toBe(1);
    expect(
      (await f.requester.c.agent.get('/tickets?requesterId=' + other.user.id))
        .status,
    ).toBe(400);
    expect(
      (await f.requester.c.agent.get('/tickets?pageSize=1000')).status,
    ).toBe(400);
  });
  it('detalhes e histórico alheios/inexistentes retornam o mesmo 404 sem revelar dados', async () => {
    const f = await fixture(),
      ticket = await create(f),
      other = await logged('REQUESTER');
    for (const suffix of ['', '/history']) {
      const denied = await other.c.agent.get('/tickets/' + ticket.id + suffix),
        absent = await other.c.agent.get('/tickets/' + randomUUID() + suffix);
      expect(denied.status).toBe(404);
      expect(absent.status).toBe(404);
      expect(denied.body.error.code).toBe(absent.body.error.code);
      expect(JSON.stringify(denied.body).includes(f.input.subject)).toBe(false);
    }
    const history = await f.requester.c.agent.get(
      '/tickets/' + ticket.id + '/history?pageSize=1',
    );
    expect(history.status).toBe(200);
    expect(history.body.total).toBe(1);
    expect(history.body.items[0].eventType).toBe('OPENED');
    expect(history.body.items[0].actorId).toBe(f.requester.user.id);
    expect(history.body.items[0].newValue).toBeUndefined();
    expect(
      (
        await f.requester.c.agent.get(
          '/tickets/' + ticket.id + '/history?page=2&pageSize=1',
        )
      ).body.items,
    ).toEqual([]);
  });
  it.each(['ADMIN', 'TECHNICIAN'] as const)(
    '%s não pode abrir chamados nem falsificar perfil',
    async (role) => {
      const f = await fixture(),
        actor = await logged(role);
      expect((await mutate(actor.c, '/tickets', f.input)).status).toBe(403);
      expect(
        (await actor.c.agent.get('/tickets').set('X-Role', 'REQUESTER')).status,
      ).toBe(200);
      expect(await database.db.ticket.count()).toBe(0);
    },
  );
  it('ADMIN possui leitura global; TECHNICIAN não lê livres ou alheios, apenas atribuídos', async () => {
    const f = await fixture(),
      ticket = await create(f),
      tech = await logged('TECHNICIAN'),
      other = await logged('TECHNICIAN');
    expect((await f.admin.c.agent.get('/tickets')).body.total).toBe(1);
    expect((await f.admin.c.agent.get('/tickets/' + ticket.id)).status).toBe(
      200,
    );
    expect((await tech.c.agent.get('/tickets')).body.total).toBe(0);
    for (const suffix of ['', '/history'])
      expect(
        (await tech.c.agent.get('/tickets/' + ticket.id + suffix)).status,
      ).toBe(404);
    // Fixture only: prepare an assigned ticket without exposing an operation API.
    await database.db.ticket.update({
      where: { id: ticket.id },
      data: {
        priority: 'LOW',
        assignedTechnicianId: tech.user.id,
        status: 'IN_PROGRESS',
        firstStartedAt: new Date(),
      },
    });
    expect((await tech.c.agent.get('/tickets')).body.total).toBe(1);
    expect(
      (await tech.c.agent.get('/tickets/' + ticket.id + '/history')).status,
    ).toBe(200);
    expect((await other.c.agent.get('/tickets/' + ticket.id)).status).toBe(404);
  });
  it('serviço/categoria inativos e catálogo inexistente são recusados sem gravação parcial', async () => {
    const f = await fixture();
    await mutate(
      f.admin.c,
      '/services/' + f.service.id,
      { isActive: false },
      true,
    );
    expect((await mutate(f.requester.c, '/tickets', f.input)).status).toBe(409);
    await mutate(
      f.admin.c,
      '/services/' + f.service.id,
      { isActive: true },
      true,
    );
    await mutate(
      f.admin.c,
      '/categories/' + f.cat.id,
      { isActive: false },
      true,
    );
    expect((await mutate(f.requester.c, '/tickets', f.input)).status).toBe(409);
    expect(
      (
        await mutate(f.requester.c, '/tickets', {
          ...f.input,
          serviceId: randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(await database.db.ticket.count()).toBe(0);
    expect(await database.db.ticketEvent.count()).toBe(0);
  });
  it('payload estrito recusa múltiplos serviços, técnico, horário, estado, snapshot e campos extras', async () => {
    const f = await fixture();
    for (const extra of [
      { serviceIds: [f.service.id, f.service.id] },
      { requesterId: f.admin.user.id },
      { assignedTechnicianId: f.admin.user.id },
      { priority: 'HIGH' },
      { status: 'CLOSED' },
      { serviceSnapshot: {} },
      { scheduledAt: new Date().toISOString() },
      { role: 'ADMIN' },
      { price: 1 },
      { answers: { extra: 'Não homologado' } },
    ])
      expect(
        (await mutate(f.requester.c, '/tickets', { ...f.input, ...extra }))
          .status,
      ).toBe(400);
    expect(
      (await mutate(f.requester.c, '/tickets', { ...f.input, subject: ' ' }))
        .status,
    ).toBe(400);
    expect(
      (await mutate(f.requester.c, '/tickets', { ...f.input, description: '' }))
        .status,
    ).toBe(400);
    expect(await database.db.ticket.count()).toBe(0);
  });
  it('formulários personalizados e uploads não são habilitados pelo novo HTTP', async () => {
    const f = await fixture();
    const form = await database.db.serviceFormVersion.findFirstOrThrow({
      where: { serviceId: f.service.id },
    });
    await database.db.serviceFormField.create({
      data: {
        formVersionId: form.id,
        key: 'extra',
        label: 'Campo futuro',
        type: 'TEXT',
      },
    });
    expect(
      (await mutate(f.requester.c, '/tickets', f.input)).body.error.code,
    ).toBe('FORM_NOT_SUPPORTED');
    expect(await database.db.ticket.count()).toBe(0);
  });
  it('renomear/desativar catálogo não altera lista, detalhes e histórico preservados', async () => {
    const f = await fixture(),
      ticket = await create(f);
    const before = await database.db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    await mutate(
      f.admin.c,
      '/services/' + f.service.id,
      { name: 'Nome novo', isActive: false },
      true,
    );
    await mutate(
      f.admin.c,
      '/categories/' + f.cat.id,
      { name: 'Categoria nova', isActive: false },
      true,
    );
    expect(
      await database.db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }),
    ).toEqual(before);
    const detail = await f.requester.c.agent.get('/tickets/' + ticket.id);
    expect(detail.body.ticket.serviceName).toBe(f.service.name);
    expect(detail.body.ticket.categoryName).toBe(f.cat.name);
    expect(
      (await f.requester.c.agent.get('/tickets')).body.items[0].serviceName,
    ).toBe(f.service.name);
    expect(
      (await f.requester.c.agent.get('/tickets/' + ticket.id + '/history')).body
        .total,
    ).toBe(1);
  });
  it('sessão, CSRF, CORS, atividade e troca inicial continuam obrigatórios', async () => {
    const f = await fixture(),
      ticket = await create(f),
      unauth = setup();
    expect((await unauth.agent.get('/tickets')).status).toBe(401);
    expect(
      (
        await f.requester.c.agent
          .post('/tickets')
          .set('Origin', origin)
          .send(f.input)
      ).status,
    ).toBe(403);
    expect(
      (
        await f.requester.c.agent
          .post('/tickets')
          .set('Origin', 'http://evil.invalid')
          .send(f.input)
      ).status,
    ).toBe(403);
    await database.db.user.update({
      where: { id: f.requester.user.id },
      data: { mustChangePassword: true },
    });
    expect(
      (await f.requester.c.agent.get('/tickets/' + ticket.id)).status,
    ).toBe(403);
    await database.db.user.update({
      where: { id: f.requester.user.id },
      data: { mustChangePassword: false, isActive: false },
    });
    expect((await f.requester.c.agent.get('/tickets')).status).toBe(401);
    await database.db.user.update({
      where: { id: f.requester.user.id },
      data: { isActive: true },
    });
    await mutate(f.requester.c, '/auth/logout', {});
    expect((await f.requester.c.agent.get('/tickets')).status).toBe(401);
  });
  it('nenhuma operação de atendimento ou escrita histórica é exposta', async () => {
    const f = await fixture(),
      ticket = await create(f);
    for (const action of [
      'priority',
      'start',
      'pending',
      'resume',
      'close',
      'comments',
    ])
      expect(
        (await mutate(f.admin.c, '/tickets/' + ticket.id + '/' + action, {}))
          .status,
      ).toBe(404);
    expect((await f.admin.c.agent.delete('/tickets/' + ticket.id)).status).toBe(
      404,
    );
  });
});
