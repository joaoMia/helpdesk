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

describe('BLOCO 03.1: visão operacional global e busca privada', () => {
  it('chamado iniciado permanece na visão global sem liberar o detalhe para outro técnico', async () => {
    const f = await classified(),
      other = await logged('TECHNICIAN');
    await database.db.user.update({
      where: { id: f.tech.user.id },
      data: { name: 'João de Teste' },
    });
    expect(
      (await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/start', {})).status,
    ).toBe(200);
    for (const c of [other.c, f.admin.c]) {
      const result = await c.agent.get('/tickets/overview');
      expect(result.status).toBe(200);
      expect(result.headers['cache-control']).toBe('no-store');
      expect(result.body.total).toBe(1);
      const row = result.body.items[0];
      expect(Object.keys(row).sort()).toEqual(
        [
          'id',
          'code',
          'status',
          'priority',
          'createdAt',
          'responsibleName',
          'canRetire',
          'categoryName',
          'serviceName',
          'requesterName',
          'companyName',
          'departmentName',
        ].sort(),
      );
      expect(row.responsibleName).toBe('João de Teste');
      expect(row.status).toBe('IN_PROGRESS');
    }
    expect((await other.c.agent.get('/tickets/' + f.ticket.id)).status).toBe(
      200,
    );
    expect(
      (await other.c.agent.get('/tickets/' + f.ticket.id + '/history')).status,
    ).toBe(200);
    expect((await other.c.agent.get('/tickets')).body.total).toBe(1);
    expect((await f.tech.c.agent.get('/tickets')).body.total).toBe(1);
    expect(
      (await f.requester.c.agent.get('/tickets/' + f.ticket.id)).status,
    ).toBe(200);
  });
  it('busca com uma letra, sem acento e por trechos de código combina filtros e paginação', async () => {
    const f = await classified();
    await database.db.user.update({
      where: { id: f.tech.user.id },
      data: { name: 'João de Teste' },
    });
    await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/start', {});
    const free = await create(f);
    for (const search of [
      'J',
      'jOaO',
      String(f.ticket.code),
      'HD-' + f.ticket.code,
    ]) {
      const r = await f.tech.c.agent.get('/tickets/overview').query({
        search,
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        pageSize: 1,
      });
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(1);
      expect(r.body.items[0].id).toBe(f.ticket.id);
    }
    const page1 = await f.tech.c.agent.get('/tickets/overview?pageSize=1'),
      page2 = await f.tech.c.agent.get('/tickets/overview?pageSize=1&page=2');
    expect(page1.body.total).toBe(2);
    expect(page2.body.total).toBe(2);
    expect(page1.body.items[0].id).not.toBe(page2.body.items[0].id);
    const unassigned = await f.tech.c.agent.get(
      '/tickets/overview?priority=NONE&status=OPEN',
    );
    expect(unassigned.body.items[0].id).toBe(free.id);
    expect(unassigned.body.items[0].responsibleName).toBe(null);
    for (const search of [
      'Solicitação',
      'Descrição',
      'Suporte',
      '%',
      '_',
      "' OR TRUE --",
    ]) {
      expect(
        (await f.tech.c.agent.get('/tickets/overview').query({ search })).body
          .total,
      ).toBe(0);
    }
  });
  it('solicitante não recebe visão global nem diretório de técnicos; filtros desconhecidos são rejeitados', async () => {
    const f = await classified();
    for (const route of ['/tickets/overview', '/tickets/assignees']) {
      expect((await f.requester.c.agent.get(route)).status).toBe(403);
      expect((await setup().agent.get(route)).status).toBe(401);
      for (const query of [
        'requesterId=' + f.requester.user.id,
        'role=ADMIN',
        'page=0',
        'pageSize=100',
        'search=' + 'a'.repeat(121),
      ])
        expect((await f.tech.c.agent.get(route + '?' + query)).status).toBe(
          400,
        );
    }
    expect((await f.admin.c.agent.get('/tickets/triage')).status).toBe(403);
  });
  it('candidatos mostram somente id/nome de técnicos ativos habilitados, com busca acentuada e paginação', async () => {
    const f = await classified(),
      inactive = await account('TECHNICIAN'),
      pending = await account('TECHNICIAN');
    await database.db.user.update({
      where: { id: inactive.id },
      data: { isActive: false },
    });
    await database.db.user.update({
      where: { id: pending.id },
      data: { mustChangePassword: true },
    });
    await database.db.user.update({
      where: { id: f.tech.user.id },
      data: { name: 'João autorizado' },
    });
    for (const c of [f.tech.c, f.admin.c]) {
      const r = await c.agent.get('/tickets/assignees?search=j&pageSize=1');
      expect(r.status).toBe(200);
      expect(r.body.total).toBe(1);
      expect(r.body.items).toEqual([
        { id: f.tech.user.id, name: 'João autorizado' },
      ]);
      expect(
        (await c.agent.get('/tickets/assignees?search=JOAO')).body.total,
      ).toBe(1);
    }
  });
  it('sessão revogada, conta inativa e troca inicial bloqueiam as consultas novas', async () => {
    const f = await classified();
    await database.db.user.update({
      where: { id: f.tech.user.id },
      data: { mustChangePassword: true },
    });
    expect((await f.tech.c.agent.get('/tickets/overview')).status).toBe(403);
    await database.db.user.update({
      where: { id: f.tech.user.id },
      data: { mustChangePassword: false, isActive: false },
    });
    expect((await f.tech.c.agent.get('/tickets/overview')).status).toBe(401);
    await mutate(f.admin.c, '/auth/logout', {});
    expect((await f.admin.c.agent.get('/tickets/assignees')).status).toBe(401);
  });
  it('busca própria normaliza acentos, preserva escopo e não expõe novos campos', async () => {
    const f = await fixture();
    await mutate(f.requester.c, '/tickets', {
      ...f.input,
      subject: 'Instalação de aplicação',
    });
    const other = await logged('REQUESTER');
    expect(
      (await f.requester.c.agent.get('/tickets?search=instalacao')).body.total,
    ).toBe(1);
    expect(
      (await f.requester.c.agent.get('/tickets?search=I')).body.total,
    ).toBe(1);
    expect((await other.c.agent.get('/tickets?search=I')).body.total).toBe(0);
  });
  it('contrato incompleto de distribuição e transferência não alteram o histórico', async () => {
    const f = await classified(),
      before = await database.db.ticket.findUniqueOrThrow({
        where: { id: f.ticket.id },
        include: { events: true },
      });
    for (const c of [f.tech.c, f.admin.c])
      for (const action of ['assign', 'transfer'])
        expect(
          (
            await mutate(c, '/tickets/' + f.ticket.id + '/' + action, {
              technicianId: f.tech.user.id,
            })
          ).status,
        ).toBe(action === 'assign' ? 400 : 404);
    await f.tech.c.agent.get('/tickets/overview');
    await f.tech.c.agent.get('/tickets/assignees');
    expect(
      await database.db.ticket.findUniqueOrThrow({
        where: { id: f.ticket.id },
        include: { events: true },
      }),
    ).toEqual(before);
  });
});
