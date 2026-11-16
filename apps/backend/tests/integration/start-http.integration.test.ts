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
import { TicketService } from '../../src/modules/tickets/ticket.service.js';
import { prismaTicketRepository } from '../../src/modules/tickets/prisma-ticket.repository.js';
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

async function classified() {
  const f = await fixture(),
    ticket = await create(f),
    tech = await logged('TECHNICIAN');
  expect(
    (
      await mutate(
        tech.c,
        '/tickets/' + ticket.id + '/priority',
        { priority: 'MEDIUM', expectedPriority: null },
        true,
      )
    ).status,
  ).toBe(200);
  return { ...f, ticket, tech };
}
describe('BLOCO 03: assunção atômica e consultas atribuídas', () => {
  it('assume, atribui e inicia em uma gravação, com evento e data do servidor', async () => {
    const f = await classified(),
      before = await database.db.ticket.findUniqueOrThrow({
        where: { id: f.ticket.id },
      }),
      time = Date.now();
    const result = await mutate(
      f.tech.c,
      '/tickets/' + f.ticket.id + '/start',
      {},
    );
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.body.ticket.status).toBe('IN_PROGRESS');
    expect(result.body.ticket.assignedTechnicianId).toBe(f.tech.user.id);
    const saved = await database.db.ticket.findUniqueOrThrow({
      where: { id: f.ticket.id },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    });
    expect(saved.firstStartedAt!.getTime()).toBeGreaterThanOrEqual(time);
    expect(saved.firstStartedAt!.getTime()).toBeLessThanOrEqual(Date.now());
    expect(saved.priority).toBe(before.priority);
    expect(saved.classifiedAt).toEqual(before.classifiedAt);
    expect(saved.classifiedById).toBe(before.classifiedById);
    expect(saved.serviceSnapshot).toEqual(before.serviceSnapshot);
    expect(saved.serviceId).toBe(before.serviceId);
    expect(saved.formVersionId).toBe(before.formVersionId);
    expect(saved.requesterId).toBe(before.requesterId);
    expect(saved.events.map((e) => e.eventType)).toEqual([
      'OPENED',
      'PRIORITY_CLASSIFIED',
      'ATTENDANCE_STARTED',
    ]);
    const event = saved.events[2]!;
    expect(event.actorId).toBe(f.tech.user.id);
    expect(event.createdAt).toEqual(saved.firstStartedAt);
    expect(event.oldValue).toEqual({
      status: 'OPEN',
      assignedTechnicianId: null,
      firstStartedAt: null,
    });
    expect(event.newValue).toEqual({
      status: 'IN_PROGRESS',
      assignedTechnicianId: f.tech.user.id,
      firstStartedAt: saved.firstStartedAt!.toISOString(),
      slaPolicyVersionId: expect.any(String),
    });
    expect(result.body.ticket.firstStartedAt).toBe(
      saved.firstStartedAt!.toISOString(),
    );
    expect(
      (await f.tech.c.agent.get('/tickets/triage?queue=CLASSIFIED')).body.total,
    ).toBe(0);
    expect(
      (await f.tech.c.agent.get('/tickets?status=IN_PROGRESS&priority=MEDIUM'))
        .body.items[0].id,
    ).toBe(saved.id);
    expect(
      (await f.requester.c.agent.get('/tickets/' + saved.id)).body.ticket
        .status,
    ).toBe('IN_PROGRESS');
    const history = await f.requester.c.agent.get(
      '/tickets/' + saved.id + '/history',
    );
    expect(history.body.items[2].eventType).toBe('ATTENDANCE_STARTED');
    expect(history.body.items[2].newValue).toBeUndefined();
  });
  it('dois técnicos concorrentes: um sucesso, um 409 e somente um evento', async () => {
    const f = await classified(),
      other = await logged('TECHNICIAN');
    const results = await Promise.all([
      mutate(f.tech.c, '/tickets/' + f.ticket.id + '/start', {}),
      mutate(other.c, '/tickets/' + f.ticket.id + '/start', {}),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const saved = await database.db.ticket.findUniqueOrThrow({
      where: { id: f.ticket.id },
    });
    expect([f.tech.user.id, other.user.id]).toContain(
      saved.assignedTechnicianId,
    );
    expect(saved.assignedTechnicianId).toBe(
      results[0]!.status === 200 ? f.tech.user.id : other.user.id,
    );
    expect(
      await database.db.ticketEvent.count({
        where: { ticketId: saved.id, eventType: 'ATTENDANCE_STARTED' },
      }),
    ).toBe(1);
    const first = saved.firstStartedAt;
    expect(
      (await mutate(f.tech.c, '/tickets/' + saved.id + '/start', {})).status,
    ).toBe(409);
    expect(
      (await database.db.ticket.findUniqueOrThrow({ where: { id: saved.id } }))
        .firstStartedAt,
    ).toEqual(first);
    expect(
      await database.db.ticketEvent.count({ where: { ticketId: saved.id } }),
    ).toBe(3);
  });
  it('livre sem prioridade, atribuído, em andamento, pendente, encerrado e inexistente são recusados', async () => {
    const f = await classified(),
      fresh = await create(f);
    expect(
      (await mutate(f.tech.c, '/tickets/' + fresh.id + '/start', {})).status,
    ).toBe(409);
    for (const status of ['IN_PROGRESS', 'PENDING', 'CLOSED'] as const) {
      const t = await create(f);
      await database.db.ticket.update({
        where: { id: t.id },
        data: {
          status,
          priority: 'LOW',
          assignedTechnicianId: f.tech.user.id,
          firstStartedAt: new Date(),
          ...(status === 'CLOSED' ? { closedAt: new Date() } : {}),
        },
      });
      expect(
        (await mutate(f.tech.c, '/tickets/' + t.id + '/start', {})).status,
      ).toBe(409);
      expect(
        await database.db.ticketEvent.count({
          where: { ticketId: t.id, eventType: 'ATTENDANCE_STARTED' },
        }),
      ).toBe(0);
    }
    expect(
      (await mutate(f.tech.c, '/tickets/' + randomUUID() + '/start', {}))
        .status,
    ).toBe(409);
  });
  it.each(['ADMIN', 'REQUESTER'] as const)(
    '%s não pode assumir ou falsificar o papel',
    async (role) => {
      const f = await classified(),
        actor = role === 'ADMIN' ? f.admin : f.requester;
      const csrf = await actor.c.agent.get('/auth/csrf').set('Origin', origin);
      expect(
        (
          await actor.c.agent
            .post('/tickets/' + f.ticket.id + '/start')
            .set('Origin', origin)
            .set('X-CSRF-Token', csrf.body.csrfToken)
            .set('X-Role', 'TECHNICIAN')
            .send({})
        ).status,
      ).toBe(403);
      expect(
        (
          await database.db.ticket.findUniqueOrThrow({
            where: { id: f.ticket.id },
          })
        ).status,
      ).toBe('OPEN');
    },
  );
  it('leitura integral não amplia a carteira de indicadores ou as mutações atribuídas', async () => {
    const f = await classified(),
      other = await logged('TECHNICIAN'),
      a = await create(f),
      b = await create(f);
    for (const t of [a, b]) {
      await mutate(
        f.tech.c,
        '/tickets/' + t.id + '/priority',
        { priority: 'LOW', expectedPriority: null },
        true,
      );
      await mutate(f.tech.c, '/tickets/' + t.id + '/start', {});
    }
    await mutate(other.c, '/tickets/' + f.ticket.id + '/start', {});
    const list = await f.tech.c.agent.get(
      '/tickets?pageSize=1&status=IN_PROGRESS',
    );
    expect(list.body.total).toBe(3);
    expect(list.body.items).toHaveLength(1);
    expect(
      (await f.tech.c.agent.get('/tickets?page=2&pageSize=1')).body.items[0].id,
    ).not.toBe(list.body.items[0].id);
    expect(
      (await f.tech.c.agent.get('/tickets?search=HD-' + f.ticket.code)).body
        .total,
    ).toBe(1);
    expect((await other.c.agent.get('/tickets?priority=LOW')).body.total).toBe(
      2,
    );
    for (const suffix of ['', '/history']) {
      const denied = await f.tech.c.agent.get(
          '/tickets/' + f.ticket.id + suffix,
        ),
        absent = await f.tech.c.agent.get('/tickets/' + randomUUID() + suffix);
      expect(denied.status).toBe(200);
      expect(absent.status).toBe(404);
      expect(
        (await other.c.agent.get('/tickets/' + f.ticket.id + suffix)).status,
      ).toBe(200);
      expect(
        (await f.requester.c.agent.get('/tickets/' + f.ticket.id + suffix))
          .status,
      ).toBe(200);
    }
    expect(
      (
        await f.tech.c.agent.get(
          '/tickets?assignedTechnicianId=' + other.user.id,
        )
      ).status,
    ).toBe(400);
    // A new login restores only the same database-derived ownership.
    await mutate(f.tech.c, '/auth/logout', {});
    expect(
      (
        await mutate(f.tech.c, '/auth/login', {
          email: f.tech.user.email,
          password,
        })
      ).status,
    ).toBe(200);
    expect((await f.tech.c.agent.get('/tickets')).body.total).toBe(3);
  });
  it('payload e query estritos recusam identidade, status, prioridade, horário e campos históricos', async () => {
    const f = await classified();
    for (const body of [
      { assignedTechnicianId: f.tech.user.id },
      { role: 'TECHNICIAN' },
      { status: 'IN_PROGRESS' },
      { firstStartedAt: new Date().toISOString() },
      { priority: 'HIGH' },
      { serviceId: f.service.id },
      { serviceSnapshot: {} },
      { answers: {} },
      { requesterId: f.requester.user.id },
    ])
      expect(
        (await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/start', body))
          .status,
      ).toBe(400);
    expect(
      (
        await mutate(
          f.tech.c,
          '/tickets/' + f.ticket.id + '/start?role=TECHNICIAN',
          {},
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await database.db.ticket.findUniqueOrThrow({
          where: { id: f.ticket.id },
        })
      ).status,
    ).toBe('OPEN');
  });
  it('CSRF, CORS, sessão, atividade e troca obrigatória continuam exigidos', async () => {
    const f = await classified(),
      url = '/tickets/' + f.ticket.id + '/start';
    expect(
      (await setup().agent.post(url).set('Origin', origin).send({})).status,
    ).toBe(403);
    expect((await mutate(setup(), url, {})).status).toBe(401);
    expect(
      (await f.tech.c.agent.post(url).set('Origin', origin).send({})).status,
    ).toBe(403);
    expect(
      (
        await f.tech.c.agent
          .post(url)
          .set('Origin', 'http://evil.invalid')
          .send({})
      ).status,
    ).toBe(403);
    await database.db.user.update({
      where: { id: f.tech.user.id },
      data: { mustChangePassword: true },
    });
    expect((await mutate(f.tech.c, url, {})).status).toBe(403);
    await database.db.user.update({
      where: { id: f.tech.user.id },
      data: { mustChangePassword: false, isActive: false },
    });
    expect((await mutate(f.tech.c, url, {})).status).toBe(401);
    await database.db.user.update({
      where: { id: f.tech.user.id },
      data: { isActive: true },
    });
    await mutate(f.tech.c, '/auth/logout', {});
    expect((await mutate(f.tech.c, url, {})).status).toBe(401);
    expect(
      (
        await database.db.ticket.findUniqueOrThrow({
          where: { id: f.ticket.id },
        })
      ).status,
    ).toBe('OPEN');
  });
  it('sessão revogada após autenticação é revalidada dentro da transação', async () => {
    const f = await classified(),
      u = f.tech.user;
    const s = await database.db.authSession.findFirstOrThrow({
      where: { userId: u.id, revokedAt: null },
    });
    await database.db.authSession.update({
      where: { id: s.id },
      data: { revokedAt: new Date(), revokeReason: 'TEST' },
    });
    const identity = {
      sessionId: s.id,
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        mustChangePassword: false,
      },
    };
    await expect(
      new TicketApiService(new TicketApiRepository(database.db)).start(
        identity,
        f.ticket.id,
        {},
      ),
    ).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    expect(
      (
        await database.db.ticket.findUniqueOrThrow({
          where: { id: f.ticket.id },
        })
      ).assignedTechnicianId,
    ).toBeNull();
  });
  it('falha ao criar evento desfaz atribuição, início e estado', async () => {
    const f = await classified();
    expect(database.schema).toMatch(/^dev003_[a-f0-9]{32}$/);
    await database.db.$executeRawUnsafe(
      `CREATE FUNCTION "${database.schema}".reject_start() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='ATTENDANCE_STARTED' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`,
    );
    await database.db.$executeRawUnsafe(
      `CREATE TRIGGER reject_start BEFORE INSERT ON "${database.schema}".ticket_events FOR EACH ROW EXECUTE FUNCTION "${database.schema}".reject_start()`,
    );
    expect(
      (await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/start', {})).status,
    ).toBe(500);
    const t = await database.db.ticket.findUniqueOrThrow({
      where: { id: f.ticket.id },
    });
    expect(t.status).toBe('OPEN');
    expect(t.assignedTechnicianId).toBeNull();
    expect(t.firstStartedAt).toBeNull();
    expect(t.priority).toBe('MEDIUM');
    expect(
      await database.db.ticketEvent.count({ where: { ticketId: t.id } }),
    ).toBe(2);
  });
  it('assunção preserva respostas e definições históricas de formulário', async () => {
    const f = await fixture(),
      tech = await logged('TECHNICIAN');
    await database.db.serviceFormVersion.create({
      data: {
        serviceId: f.service.id,
        version: 2,
        fields: {
          create: {
            key: 'device',
            label: 'Equipamento',
            type: 'TEXT',
            required: true,
          },
        },
      },
    });
    const t = await new TicketService(prismaTicketRepository(database.db)).open(
      f.requester.user.id,
      { ...f.input, answers: { device: 'PC-TEST' } },
    );
    await mutate(
      tech.c,
      '/tickets/' + t.id + '/priority',
      { priority: 'HIGH', expectedPriority: null },
      true,
    );
    const before = await database.db.ticket.findUniqueOrThrow({
      where: { id: t.id },
      include: { answers: true },
    });
    expect(
      (await mutate(tech.c, '/tickets/' + t.id + '/start', {})).status,
    ).toBe(200);
    const after = await database.db.ticket.findUniqueOrThrow({
      where: { id: t.id },
      include: { answers: true },
    });
    for (const field of [
      'serviceId',
      'formVersionId',
      'requesterId',
      'serviceSnapshot',
      'answers',
      'priority',
      'createdAt',
    ] as const)
      expect(after[field]).toEqual(before[field]);
  });
  it('não habilita pendência, encerramento, transferência, comentário, anexo ou edição estrutural', async () => {
    const f = await classified();
    await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/start', {});
    for (const action of [
      'pending',
      'close',
      'resume',
      'transfer',
      'reopen',
      'comments',
      'attachments',
    ])
      expect(
        (await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/' + action, {}))
          .status,
      ).toBe(404);
    expect(
      (
        await mutate(
          f.tech.c,
          '/tickets/' + f.ticket.id,
          { serviceId: randomUUID() },
          true,
        )
      ).status,
    ).toBe(404);
    const t = await database.db.ticket.findUniqueOrThrow({
      where: { id: f.ticket.id },
    });
    expect(t.closedAt).toBeNull();
    expect(t.status).toBe('IN_PROGRESS');
  });
});
