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

describe('BLOCO 02: filas e classificação reais', () => {
  it('revalida a sessão dentro da transação mesmo após autenticação anterior', async () => {
    const f = await fixture(),
      ticket = await create(f),
      tech = await logged('TECHNICIAN');
    const session = await database.db.authSession.findFirstOrThrow({
      where: { userId: tech.user.id, revokedAt: null },
    });
    const identity = {
      sessionId: session.id,
      user: {
        id: tech.user.id,
        name: tech.user.name,
        email: tech.user.email,
        role: tech.user.role,
        mustChangePassword: false,
      },
    };
    await database.db.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokeReason: 'TEST' },
    });
    await expect(
      new TicketApiService(new TicketApiRepository(database.db)).classify(
        identity,
        ticket.id,
        { priority: 'LOW', expectedPriority: null },
      ),
    ).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    expect(
      (await database.db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
        .priority,
    ).toBeNull();
    expect(
      await database.db.ticketEvent.count({
        where: { eventType: 'PRIORITY_CLASSIFIED' },
      }),
    ).toBe(0);
  });
  it('OPEN livre entra na fila mínima; LOW/MEDIUM/HIGH não atribuem nem iniciam', async () => {
    const f = await fixture(),
      ticket = await create(f),
      tech = await logged('TECHNICIAN');
    const original = await database.db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    const list = await tech.c.agent.get('/tickets/triage');
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(Object.keys(list.body.items[0]).sort()).toEqual(
      ['id', 'code', 'status', 'priority', 'createdAt'].sort(),
    );
    let expectedPriority: 'LOW' | 'MEDIUM' | 'HIGH' | null = null;
    for (const priority of ['LOW', 'MEDIUM', 'HIGH'] as const) {
      const classified = await mutate(
        tech.c,
        '/tickets/' + ticket.id + '/priority',
        { priority, expectedPriority },
        true,
      );
      expect(classified.status).toBe(200);
      expect(Object.keys(classified.body.ticket).sort()).toEqual(
        ['id', 'code', 'status', 'priority', 'createdAt'].sort(),
      );
      expect(classified.body.ticket.priority).toBe(priority);
      const saved = await database.db.ticket.findUniqueOrThrow({
        where: { id: ticket.id },
      });
      expect(saved.status).toBe('OPEN');
      expect(saved.assignedTechnicianId).toBeNull();
      expect(saved.firstStartedAt).toBeNull();
      expect(saved.classifiedById).toBe(tech.user.id);
      expect(saved.classifiedAt).toBeInstanceOf(Date);
      expect(saved.serviceSnapshot).toEqual(original.serviceSnapshot);
      expect(saved.serviceId).toBe(original.serviceId);
      expect(saved.formVersionId).toBe(original.formVersionId);
      const event = await database.db.ticketEvent.findFirstOrThrow({
        where: { ticketId: ticket.id, eventType: 'PRIORITY_CLASSIFIED' },
        orderBy: { createdAt: 'desc' },
      });
      expect(event.actorId).toBe(tech.user.id);
      expect(event.oldValue).toEqual({ priority: expectedPriority });
      expect(event.newValue).toEqual({ priority });
      expectedPriority = priority;
    }
    expect(
      (await tech.c.agent.get('/tickets/triage?queue=UNCLASSIFIED')).body.total,
    ).toBe(0);
    expect(
      (await tech.c.agent.get('/tickets/triage?queue=CLASSIFIED')).body.total,
    ).toBe(1);
    const detail = await f.requester.c.agent.get('/tickets/' + ticket.id);
    expect(detail.body.ticket.priority).toBe('HIGH');
    const history = await f.requester.c.agent.get(
      '/tickets/' + ticket.id + '/history',
    );
    expect(
      history.body.items.filter(
        (e: { eventType: string }) => e.eventType === 'OPENED',
      ),
    ).toHaveLength(1);
    expect(
      history.body.items.filter(
        (e: { eventType: string }) => e.eventType === 'PRIORITY_CLASSIFIED',
      ),
    ).toHaveLength(3);
    expect(
      history.body.items.every(
        (e: object) => !('oldValue' in e) && !('newValue' in e),
      ),
    ).toBe(true);
    expect((await tech.c.agent.get('/tickets/' + ticket.id)).status).toBe(404);
  });
  it('filas, união, busca por código, filtros e paginação são coerentes e estritos', async () => {
    const f = await fixture(),
      a = await create(f),
      b = await create(f),
      c = await create(f),
      tech = await logged('TECHNICIAN');
    await mutate(
      tech.c,
      '/tickets/' + b.id + '/priority',
      { priority: 'MEDIUM', expectedPriority: null },
      true,
    );
    await database.db.ticket.update({
      where: { id: c.id },
      data: {
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        assignedTechnicianId: tech.user.id,
        firstStartedAt: new Date(),
      },
    });
    const all = await tech.c.agent.get('/tickets/triage?queue=ALL&pageSize=1');
    expect(all.body.total).toBe(2);
    expect(all.body.items).toHaveLength(1);
    const second = await tech.c.agent.get(
      '/tickets/triage?queue=ALL&pageSize=1&page=2',
    );
    expect(second.body.items[0].id).not.toBe(all.body.items[0].id);
    expect(
      (await tech.c.agent.get('/tickets/triage?queue=ALL&search=HD-' + a.code))
        .body.items[0].id,
    ).toBe(a.id);
    expect(
      (await tech.c.agent.get('/tickets/triage?queue=ALL&priority=MEDIUM')).body
        .total,
    ).toBe(1);
    expect(
      (
        await tech.c.agent.get(
          '/tickets/triage?queue=UNCLASSIFIED&priority=HIGH',
        )
      ).body.total,
    ).toBe(0);
    for (const query of [
      'status=CLASSIFIED',
      'queue=CLOSED',
      'requesterId=' + f.requester.user.id,
      'search=privado',
      'pageSize=51',
      'where=x',
      'search=2147483648',
    ])
      expect((await tech.c.agent.get('/tickets/triage?' + query)).status).toBe(
        400,
      );
  });
  it.each(['ADMIN', 'REQUESTER'] as const)(
    '%s não pode triar ou classificar; headers não concedem papel',
    async (role) => {
      const f = await fixture(),
        ticket = await create(f),
        actor = role === 'ADMIN' ? f.admin : f.requester;
      expect(
        (await actor.c.agent.get('/tickets/triage').set('X-Role', 'TECHNICIAN'))
          .status,
      ).toBe(403);
      expect(
        (
          await mutate(
            actor.c,
            '/tickets/' + ticket.id + '/priority',
            { priority: 'LOW', expectedPriority: null },
            true,
          )
        ).status,
      ).toBe(403);
      expect(
        (
          await database.db.ticket.findUniqueOrThrow({
            where: { id: ticket.id },
          })
        ).priority,
      ).toBeNull();
    },
  );
  it('contrato rejeita identidade, atributos privilegiados, prioridades e precondições inválidas', async () => {
    const f = await fixture(),
      t = await create(f),
      tech = await logged('TECHNICIAN');
    for (const input of [
      { priority: null, expectedPriority: null },
      { priority: 'URGENT', expectedPriority: null },
      { priority: 'LOW' },
      { priority: 'LOW', expectedPriority: null, status: 'IN_PROGRESS' },
      {
        priority: 'LOW',
        expectedPriority: null,
        assignedTechnicianId: tech.user.id,
      },
      { priority: 'LOW', expectedPriority: null, role: 'TECHNICIAN' },
    ])
      expect(
        (await mutate(tech.c, '/tickets/' + t.id + '/priority', input, true))
          .status,
      ).toBe(400);
    expect(
      await database.db.ticketEvent.count({
        where: { eventType: 'PRIORITY_CLASSIFIED' },
      }),
    ).toBe(0);
  });
  it('concorrência e precondição desatualizada retornam 409; repetição efetivamente neutra não gera evento', async () => {
    const f = await fixture(),
      t = await create(f),
      a = await logged('TECHNICIAN'),
      b = await logged('TECHNICIAN');
    const [x, y] = await Promise.all([
      mutate(
        a.c,
        '/tickets/' + t.id + '/priority',
        { priority: 'LOW', expectedPriority: null },
        true,
      ),
      mutate(
        b.c,
        '/tickets/' + t.id + '/priority',
        { priority: 'HIGH', expectedPriority: null },
        true,
      ),
    ]);
    expect([x.status, y.status].sort()).toEqual([200, 409]);
    const saved = await database.db.ticket.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(
      await database.db.ticketEvent.count({
        where: { ticketId: t.id, eventType: 'PRIORITY_CLASSIFIED' },
      }),
    ).toBe(1);
    const before = {
      classifiedAt: saved.classifiedAt,
      classifiedById: saved.classifiedById,
      updatedAt: saved.updatedAt,
    };
    expect(
      (
        await mutate(
          a.c,
          '/tickets/' + t.id + '/priority',
          { priority: saved.priority, expectedPriority: saved.priority },
          true,
        )
      ).status,
    ).toBe(200);
    const after = await database.db.ticket.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect({
      classifiedAt: after.classifiedAt,
      classifiedById: after.classifiedById,
      updatedAt: after.updatedAt,
    }).toEqual(before);
    expect(
      await database.db.ticketEvent.count({ where: { ticketId: t.id } }),
    ).toBe(2);
    expect(
      (
        await mutate(
          a.c,
          '/tickets/' + t.id + '/priority',
          { priority: 'MEDIUM', expectedPriority: null },
          true,
        )
      ).status,
    ).toBe(409);
  });
  it('chamados atribuídos, encerrados e inexistentes não podem ser classificados nem revelados', async () => {
    const f = await fixture(),
      t = await create(f),
      closed = await create(f),
      tech = await logged('TECHNICIAN');
    await database.db.ticket.update({
      where: { id: t.id },
      data: {
        priority: 'LOW',
        status: 'IN_PROGRESS',
        assignedTechnicianId: tech.user.id,
        firstStartedAt: new Date(),
      },
    });
    await database.db.ticket.update({
      where: { id: closed.id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    for (const id of [t.id, closed.id, randomUUID()])
      expect(
        (
          await mutate(
            tech.c,
            '/tickets/' + id + '/priority',
            { priority: 'HIGH', expectedPriority: null },
            true,
          )
        ).status,
      ).toBe(409);
    expect(
      (await tech.c.agent.get('/tickets/triage?queue=ALL')).body.total,
    ).toBe(0);
    expect(
      await database.db.ticketEvent.count({
        where: { eventType: 'PRIORITY_CLASSIFIED' },
      }),
    ).toBe(0);
  });
  it('falha de auditoria desfaz também a prioridade (mesma transação)', async () => {
    const f = await fixture(),
      t = await create(f),
      tech = await logged('TECHNICIAN');
    // Only the freshly-created test namespace, never development or public.
    expect(database.schema).toMatch(/^dev003_[a-f0-9]{32}$/);
    await database.db.$executeRawUnsafe(
      `CREATE FUNCTION "${database.schema}".reject_classification() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='PRIORITY_CLASSIFIED' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`,
    );
    await database.db.$executeRawUnsafe(
      `CREATE TRIGGER reject_classification BEFORE INSERT ON "${database.schema}".ticket_events FOR EACH ROW EXECUTE FUNCTION "${database.schema}".reject_classification()`,
    );
    expect(
      (
        await mutate(
          tech.c,
          '/tickets/' + t.id + '/priority',
          { priority: 'LOW', expectedPriority: null },
          true,
        )
      ).status,
    ).toBe(500);
    const saved = await database.db.ticket.findUniqueOrThrow({
      where: { id: t.id },
    });
    expect(saved.priority).toBeNull();
    expect(saved.classifiedAt).toBeNull();
    expect(saved.classifiedById).toBeNull();
    expect(
      await database.db.ticketEvent.count({ where: { ticketId: t.id } }),
    ).toBe(1);
  });
  it('sessões, CSRF, CORS, atividade e troca inicial protegem consulta e escrita', async () => {
    const f = await fixture(),
      t = await create(f),
      tech = await logged('TECHNICIAN'),
      input = { priority: 'LOW', expectedPriority: null };
    expect((await setup().agent.get('/tickets/triage')).status).toBe(401);
    expect(
      (
        await tech.c.agent
          .patch('/tickets/' + t.id + '/priority')
          .set('Origin', origin)
          .send(input)
      ).status,
    ).toBe(403);
    expect(
      (
        await tech.c.agent
          .patch('/tickets/' + t.id + '/priority')
          .set('Origin', 'http://evil.invalid')
          .send(input)
      ).status,
    ).toBe(403);
    await database.db.user.update({
      where: { id: tech.user.id },
      data: { mustChangePassword: true },
    });
    expect((await tech.c.agent.get('/tickets/triage')).status).toBe(403);
    expect(
      (await mutate(tech.c, '/tickets/' + t.id + '/priority', input, true))
        .status,
    ).toBe(403);
    await database.db.user.update({
      where: { id: tech.user.id },
      data: { mustChangePassword: false, isActive: false },
    });
    expect((await tech.c.agent.get('/tickets/triage')).status).toBe(401);
    expect(
      (await mutate(tech.c, '/tickets/' + t.id + '/priority', input, true))
        .status,
    ).toBe(401);
    await database.db.user.update({
      where: { id: tech.user.id },
      data: { isActive: true },
    });
    await mutate(tech.c, '/auth/logout', {});
    expect((await tech.c.agent.get('/tickets/triage')).status).toBe(401);
    expect(
      (await mutate(tech.c, '/tickets/' + t.id + '/priority', input, true))
        .status,
    ).toBe(401);
  });
});
