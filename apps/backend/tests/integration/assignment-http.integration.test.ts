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

describe('Execução integrada: distribuição separada do início', () => {
  it('distribui para outro técnico mantendo OPEN, início nulo e evento atômico', async () => {
    const f = await classified(),
      recipient = await logged('TECHNICIAN');
    const r = await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/assign', {
      technicianId: recipient.user.id,
      expectedPriority: 'MEDIUM',
    });
    expect(r.status).toBe(200);
    expect(r.body.ticket).toMatchObject({
      status: 'OPEN',
      firstStartedAt: null,
      assignedTechnicianId: recipient.user.id,
    });
    expect((await recipient.c.agent.get('/tickets')).body.total).toBe(1);
    expect((await f.tech.c.agent.get('/tickets')).body.total).toBe(1);
    for (const client of [recipient.c, f.tech.c, f.admin.c]) {
      const detail = await client.agent.get('/tickets/' + f.ticket.id);
      expect(detail.status).toBe(200);
      expect(detail.body.ticket).toMatchObject({
        status: 'OPEN',
        priority: 'MEDIUM',
        assignedTechnicianId: recipient.user.id,
        firstStartedAt: null,
      });
    }
    expect(
      (await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/start', {})).status,
    ).toBe(409);
    expect(
      (await mutate(recipient.c, '/tickets/' + f.ticket.id + '/start', {}))
        .status,
    ).toBe(200);
    const saved = await database.db.ticket.findUniqueOrThrow({
      where: { id: f.ticket.id },
      include: { events: true },
    });
    expect(saved.status).toBe('IN_PROGRESS');
    expect(saved.assignedTechnicianId).toBe(recipient.user.id);
    expect(saved.firstStartedAt).not.toBe(null);
    expect(saved.events.filter((e) => e.eventType === 'ASSIGNED')).toHaveLength(
      1,
    );
    expect(
      saved.events.filter((e) => e.eventType === 'ATTENDANCE_STARTED'),
    ).toHaveLength(1);
  });
  it('duas distribuições concorrentes têm somente um sucesso e um 409', async () => {
    const f = await classified(),
      b = await logged('TECHNICIAN'),
      c = await logged('TECHNICIAN');
    const results = await Promise.all([
      mutate(f.tech.c, '/tickets/' + f.ticket.id + '/assign', {
        technicianId: b.user.id,
        expectedPriority: 'MEDIUM',
      }),
      mutate(c.c, '/tickets/' + f.ticket.id + '/assign', {
        technicianId: c.user.id,
        expectedPriority: 'MEDIUM',
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await database.db.ticketEvent.count({
        where: { ticketId: f.ticket.id, eventType: 'ASSIGNED' },
      }),
    ).toBe(1);
  });
  it('ADMIN distribui mas não inicia, solicitante e destinatários inválidos são recusados', async () => {
    const f = await classified();
    for (const uid of [f.requester.user.id, f.admin.user.id])
      expect(
        (
          await mutate(f.admin.c, '/tickets/' + f.ticket.id + '/assign', {
            technicianId: uid,
            expectedPriority: 'MEDIUM',
          })
        ).status,
      ).toBe(409);
    expect(
      (
        await mutate(f.requester.c, '/tickets/' + f.ticket.id + '/assign', {
          technicianId: f.tech.user.id,
          expectedPriority: 'MEDIUM',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await mutate(f.admin.c, '/tickets/' + f.ticket.id + '/assign', {
          technicianId: f.tech.user.id,
          expectedPriority: 'MEDIUM',
          status: 'IN_PROGRESS',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await mutate(f.admin.c, '/tickets/' + f.ticket.id + '/assign', {
          technicianId: f.tech.user.id,
          expectedPriority: 'MEDIUM',
        })
      ).status,
    ).toBe(200);
    expect(
      (await mutate(f.admin.c, '/tickets/' + f.ticket.id + '/start', {}))
        .status,
    ).toBe(403);
  });
  it('ficha restrita não expõe dados privados e somente responsável altera prioridade após atribuição', async () => {
    const f = await classified(),
      b = await logged('TECHNICIAN');
    const r = await f.tech.c.agent.get('/tickets/' + f.ticket.id + '/triage');
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.ticket).sort()).toEqual(
      [
        'id',
        'code',
        'status',
        'priority',
        'createdAt',
        'categoryName',
        'serviceName',
        'requesterName',
        'companyName',
        'departmentName',
      ].sort(),
    );
    await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/assign', {
      technicianId: b.user.id,
      expectedPriority: 'MEDIUM',
    });
    expect(
      (await f.tech.c.agent.get('/tickets/' + f.ticket.id + '/triage')).status,
    ).toBe(404);
    expect(
      (
        await mutate(
          f.tech.c,
          '/tickets/' + f.ticket.id + '/priority',
          { priority: 'HIGH', expectedPriority: 'MEDIUM' },
          true,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await mutate(
          b.c,
          '/tickets/' + f.ticket.id + '/priority',
          { priority: 'HIGH', expectedPriority: 'MEDIUM' },
          true,
        )
      ).status,
    ).toBe(200);
    expect(
      (await f.requester.c.agent.get('/tickets/' + f.ticket.id)).body.ticket
        .priority,
    ).toBe('HIGH');
  });
  it('destinatário inativo, sessão revogada e CSRF não escrevem', async () => {
    const f = await classified(),
      b = await logged('TECHNICIAN');
    await database.db.user.update({
      where: { id: b.user.id },
      data: { isActive: false },
    });
    expect(
      (
        await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/assign', {
          technicianId: b.user.id,
          expectedPriority: 'MEDIUM',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await f.tech.c.agent
          .post('/tickets/' + f.ticket.id + '/assign')
          .set('Origin', origin)
          .send({ technicianId: f.tech.user.id, expectedPriority: 'MEDIUM' })
      ).status,
    ).toBe(403);
    await mutate(f.tech.c, '/auth/logout', {});
    expect(
      (
        await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/assign', {
          technicianId: f.tech.user.id,
          expectedPriority: 'MEDIUM',
        })
      ).status,
    ).toBe(401);
  });
});
