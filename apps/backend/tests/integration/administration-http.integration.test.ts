import { AdministrationService } from '../../src/modules/administration/administration.service.js';
import { AdministrationRepository } from '../../src/modules/administration/administration.repository.js';
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
import { Passwords, hashPassword } from '../../src/modules/auth/password.js';
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
    new AdministrationService(new AdministrationRepository(database.db)),
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

const scheduleInput = {
  name: 'Expediente isolado',
  timezone: 'America/Sao_Paulo',
  weekly: [
    { day: 1, startMinute: 480, endMinute: 720 },
    { day: 1, startMinute: 780, endMinute: 1080 },
  ],
  exceptions: [],
};
async function organization(c: Client) {
  const company = await mutate(c, '/admin/companies', {
    name: 'Empresa isolada',
  });
  expect(company.status).toBe(201);
  const department = await mutate(c, '/admin/departments', {
    name: 'TI isolado',
    companyId: company.body.item.id,
  });
  expect(department.status).toBe(201);
  return { company: company.body.item, department: department.body.item };
}
describe('Checkpoint 2: administração e jornadas reais', () => {
  it('ADMIN cadastra empresa/setor, edita/desativa sem excluir ou propagar atividade', async () => {
    const a = await logged('ADMIN'),
      org = await organization(a.c);
    expect(
      (
        await mutate(
          a.c,
          '/admin/companies/' + org.company.id,
          { name: 'Empresa renomeada', isActive: false },
          true,
        )
      ).status,
    ).toBe(200);
    expect(
      (await a.c.agent.get('/admin/companies?status=inactive')).body.total,
    ).toBe(1);
    expect(
      (await a.c.agent.get('/admin/departments?companyId=' + org.company.id))
        .body.total,
    ).toBe(1);
    expect(await database.db.department.count()).toBe(1);
  });
  it('ADMIN cria os três papéis com credencial individual Argon2id e troca obrigatória', async () => {
    const a = await logged('ADMIN'),
      secrets = new Set<string>();
    for (const role of ['ADMIN', 'TECHNICIAN', 'REQUESTER']) {
      const r = await mutate(a.c, '/admin/users', {
        name: 'Conta isolada',
        email: randomUUID() + '@example.invalid',
        role,
      });
      expect(r.status).toBe(201);
      expect(r.headers['cache-control']).toBe('no-store');
      expect(r.body.user.role).toBe(role);
      expect(r.body.user.mustChangePassword).toBe(true);
      expect(r.body.user.passwordHash).toBeUndefined();
      secrets.add(r.body.temporaryPassword);
      const row = await database.db.user.findUniqueOrThrow({
        where: { id: r.body.user.id },
      });
      expect(
        await new Passwords().verify(
          row.passwordHash,
          r.body.temporaryPassword,
        ),
      ).toBe(true);
      expect(row.passwordHash.startsWith('$argon2id$')).toBe(true);
    }
    expect(secrets.size).toBe(3);
  });
  it('setor de outra empresa, usuário duplicado e mass assignment são recusados', async () => {
    const a = await logged('ADMIN'),
      org = await organization(a.c),
      b = await mutate(a.c, '/admin/companies', { name: 'Outra empresa' });
    expect(
      (
        await mutate(a.c, '/admin/users', {
          name: 'Conta teste',
          email: 'unique@example.invalid',
          role: 'REQUESTER',
          companyId: b.body.item.id,
          departmentId: org.department.id,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await mutate(a.c, '/admin/users', {
          name: 'Conta teste',
          email: 'unique@example.invalid',
          role: 'REQUESTER',
          passwordHash: 'not-accepted',
        })
      ).status,
    ).toBe(400);
    const r = await mutate(a.c, '/admin/users', {
      name: 'Conta teste',
      email: 'UNIQUE@example.invalid',
      role: 'REQUESTER',
      username: 'joao.teste',
      companyId: org.company.id,
      departmentId: org.department.id,
    });
    expect(r.status).toBe(201);
    expect(
      (
        await mutate(a.c, '/admin/users', {
          name: 'Outra conta',
          email: 'unique@example.invalid',
          role: 'TECHNICIAN',
        })
      ).status,
    ).toBe(409);
    expect(
      (await a.c.agent.get('/admin/companies/' + org.company.id)).body.item
        .userCount,
    ).toBe(1);
  });
  it('último ADMIN ativo não pode ser desativado ou rebaixado', async () => {
    const a = await logged('ADMIN');
    for (const body of [{ isActive: false }, { role: 'REQUESTER' }])
      expect(
        (await mutate(a.c, '/admin/users/' + a.user.id, body, true)).status,
      ).toBe(409);
    expect(
      await database.db.user.count({
        where: { role: 'ADMIN', isActive: true },
      }),
    ).toBe(1);
  });
  it('desativações concorrentes preservam um ADMIN ativo', async () => {
    const a = await logged('ADMIN'),
      b = await logged('ADMIN');
    const rs = await Promise.all([
      mutate(a.c, '/admin/users/' + a.user.id, { isActive: false }, true),
      mutate(b.c, '/admin/users/' + b.user.id, { isActive: false }, true),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      await database.db.user.count({
        where: { role: 'ADMIN', isActive: true },
      }),
    ).toBe(1);
  });
  it('edição sensível revoga sessões, mantém senha e impede privilégios pelo perfil próprio', async () => {
    const a = await logged('ADMIN'),
      r = await logged('REQUESTER'),
      before = await database.db.user.findUniqueOrThrow({
        where: { id: r.user.id },
      });
    const result = await mutate(
      a.c,
      '/admin/users/' + r.user.id,
      { email: 'new-address@example.invalid', role: 'TECHNICIAN' },
      true,
    );
    expect(result.status).toBe(200);
    expect((await r.c.agent.get('/auth/me')).status).toBe(401);
    expect(
      (await database.db.user.findUniqueOrThrow({ where: { id: r.user.id } }))
        .passwordHash,
    ).toBe(before.passwordHash);
    expect(
      (
        await mutate(r.c, '/auth/login', {
          email: 'new-address@example.invalid',
          password,
        })
      ).status,
    ).toBe(200);
    expect(
      (await mutate(r.c, '/users/me', { companyId: randomUUID() }, true))
        .status,
    ).toBe(400);
  });
  it('ADMIN desativa e reativa a mesma conta pela atualização administrativa', async () => {
    const admin = await logged('ADMIN'),
      requester = await logged('REQUESTER'),
      path = '/admin/users/' + requester.user.id;
    const inactive = await mutate(admin.c, path, { isActive: false }, true);
    expect(inactive.status).toBe(200);
    expect((await requester.c.agent.get('/auth/me')).status).toBe(401);
    const active = await mutate(admin.c, path, { isActive: true }, true);
    expect(active.status).toBe(200);
    expect(
      (
        await mutate(requester.c, '/auth/login', {
          email: requester.user.email,
          password,
        })
      ).status,
    ).toBe(200);
    expect(
      await database.db.user.count({ where: { id: requester.user.id } }),
    ).toBe(1);
  });
  it('redefinição exige ADMIN, não reativa conta, revoga sessão e exige nova troca', async () => {
    const a = await logged('ADMIN'),
      r = await logged('REQUESTER');
    expect(
      (await mutate(r.c, '/admin/users/' + a.user.id + '/reset-password', {}))
        .status,
    ).toBe(403);
    expect(
      (await mutate(a.c, '/admin/users/' + a.user.id + '/reset-password', {}))
        .status,
    ).toBe(409);
    const reset = await mutate(
      a.c,
      '/admin/users/' + r.user.id + '/reset-password',
      {},
    );
    expect(reset.status).toBe(200);
    expect((await r.c.agent.get('/auth/me')).status).toBe(401);
    expect(
      (await mutate(r.c, '/auth/login', { email: r.user.email, password }))
        .status,
    ).toBe(401);
    const login = await mutate(r.c, '/auth/login', {
      email: r.user.email,
      password: reset.body.temporaryPassword,
    });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    expect((await r.c.agent.get('/users/me')).status).toBe(403);
  });
  it('técnico com atendimento ativo não perde perfil/atividade silenciosamente', async () => {
    const f = await classified();
    await mutate(f.tech.c, '/tickets/' + f.ticket.id + '/start', {});
    expect(
      (
        await mutate(
          f.admin.c,
          '/admin/users/' + f.tech.user.id,
          { role: 'REQUESTER' },
          true,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await mutate(
          f.admin.c,
          '/admin/users/' + f.tech.user.id,
          { isActive: false },
          true,
        )
      ).status,
    ).toBe(409);
  });
  it('jornada rejeita sobreposição/fuso inválido e preserva versões imutáveis', async () => {
    const a = await logged('ADMIN');
    expect(
      (
        await mutate(a.c, '/admin/schedules', {
          ...scheduleInput,
          weekly: [
            { day: 1, startMinute: 480, endMinute: 720 },
            { day: 1, startMinute: 600, endMinute: 800 },
          ],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await mutate(a.c, '/admin/schedules', {
          ...scheduleInput,
          timezone: 'Invalid/Timezone',
        })
      ).status,
    ).toBe(400);
    const r = await mutate(a.c, '/admin/schedules', scheduleInput);
    expect(r.status).toBe(201);
    const id = r.body.item.id,
      oldId = r.body.item.versions[0].id;
    expect(
      (
        await mutate(
          a.c,
          '/admin/schedules/' + id,
          { weekly: [{ day: 2, startMinute: 600, endMinute: 720 }] },
          true,
        )
      ).status,
    ).toBe(200);
    expect(
      (await a.c.agent.get('/admin/schedules/' + id + '/versions')).body.total,
    ).toBe(2);
    expect(
      (
        await database.db.workScheduleVersion.findUniqueOrThrow({
          where: { id: oldId },
        })
      ).weekly,
    ).toEqual(scheduleInput.weekly);
    await expect(
      database.db.workScheduleVersion.update({
        where: { id: oldId },
        data: { timezone: 'UTC' },
      }),
    ).rejects.toBeDefined();
  });
  it('abertura captura empresa/setor e versões, mudanças cadastrais não reescrevem snapshots', async () => {
    const f = await fixture(),
      org = await organization(f.admin.c),
      r = await mutate(f.admin.c, '/admin/schedules', scheduleInput),
      schedule = r.body.item;
    await mutate(
      f.admin.c,
      '/admin/organization-default',
      { workScheduleId: schedule.id },
      true,
    );
    await mutate(
      f.admin.c,
      '/admin/users/' + f.requester.user.id,
      { companyId: org.company.id, departmentId: org.department.id },
      true,
    );
    await mutate(f.requester.c, '/auth/login', {
      email: f.requester.user.email,
      password,
    });
    const ticket = await create(f);
    const before = await database.db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(
      (before.organizationSnapshot as { companyName: string }).companyName,
    ).toBe('Empresa isolada');
    expect(
      await database.db.ticketCalendarSegment.count({
        where: { ticketId: ticket.id },
      }),
    ).toBe(1);
    await mutate(
      f.admin.c,
      '/admin/companies/' + org.company.id,
      { name: 'Nome novo' },
      true,
    );
    await mutate(
      f.admin.c,
      '/admin/departments/' + org.department.id,
      { name: 'Setor novo' },
      true,
    );
    expect(
      (await database.db.ticket.findUniqueOrThrow({ where: { id: ticket.id } }))
        .organizationSnapshot,
    ).toEqual(before.organizationSnapshot);
    await expect(
      database.db.ticket.update({
        where: { id: ticket.id },
        data: { organizationSnapshot: { companyName: 'tampered' } },
      }),
    ).rejects.toBeDefined();
  });
  it('mudança de expediente segmenta apenas o futuro e preserva a versão anterior', async () => {
    const f = await fixture(),
      r = await mutate(f.admin.c, '/admin/schedules', scheduleInput),
      schedule = r.body.item;
    await mutate(
      f.admin.c,
      '/admin/organization-default',
      { workScheduleId: schedule.id },
      true,
    );
    const ticket = await create(f);
    const before = await database.db.ticketCalendarSegment.findFirstOrThrow({
      where: { ticketId: ticket.id, endsAt: null },
    });
    const update = await mutate(
      f.admin.c,
      '/admin/schedules/' + schedule.id,
      { weekly: [{ day: 3, startMinute: 600, endMinute: 900 }] },
      true,
    );
    expect(update.status).toBe(200);
    const old = await database.db.ticketCalendarSegment.findUniqueOrThrow({
        where: { id: before.id },
      }),
      next = await database.db.ticketCalendarSegment.findFirstOrThrow({
        where: { ticketId: ticket.id, endsAt: null },
      });
    expect(old.endsAt).not.toBe(null);
    expect(next.versionId).not.toBe(old.versionId);
    expect(next.startsAt).toEqual(old.endsAt);
  });
  it('busca parcial, filtros e paginação são reais e não expõem credenciais', async () => {
    const a = await logged('ADMIN');
    const org = await organization(a.c);
    for (const name of ['João Um', 'João Dois'])
      await mutate(a.c, '/admin/users', {
        name,
        email: randomUUID() + '@example.invalid',
        role: 'REQUESTER',
        companyId: org.company.id,
      });
    const r = await a.c.agent.get('/admin/users').query({
      search: 'J',
      companyId: org.company.id,
      role: 'REQUESTER',
      pageSize: 1,
    });
    expect(r.status).toBe(200);
    expect(r.body.total).toBe(2);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0].passwordHash).toBeUndefined();
    expect(r.body.items[0].temporaryPassword).toBeUndefined();
    const second = await a.c.agent.get('/admin/users').query({
      search: 'joao',
      companyId: org.company.id,
      pageSize: 1,
      page: 2,
    });
    expect(second.body.total).toBe(2);
    expect(second.body.items[0].id).not.toBe(r.body.items[0].id);
  });
  it('papéis não administrativos, CSRF, origem e parâmetros extras são recusados', async () => {
    const a = await logged('ADMIN'),
      r = await logged('REQUESTER'),
      t = await logged('TECHNICIAN');
    for (const client of [r.c, t.c])
      for (const path of [
        '/admin/users',
        '/admin/companies',
        '/admin/departments',
        '/admin/schedules',
      ])
        expect((await client.agent.get(path)).status).toBe(403);
    expect(
      (
        await a.c.agent
          .post('/admin/companies')
          .set('Origin', origin)
          .send({ name: 'No csrf' })
      ).status,
    ).toBe(403);
    expect(
      (await a.c.agent.get('/admin/users').set('Origin', 'http://evil.example'))
        .status,
    ).toBe(403);
    expect((await a.c.agent.get('/admin/users?passwordHash=true')).status).toBe(
      400,
    );
  });
});

it('formulário: ADMIN salva rascunho, publica versões e mantém snapshot antigo; outros perfis não escrevem', async () => {
  const f = await fixture(),
    url = '/services/' + f.service.id + '/form';
  const field = {
    id: randomUUID(),
    key: 'app',
    label: 'Aplicativo',
    type: 'TEXT',
    required: true,
    help: 'Sem credenciais',
  };
  const definition = {
    title: 'Instalação',
    description: 'Formulário real',
    fields: [field],
  };
  expect(
    (
      await mutate(
        f.requester.c,
        url + '/draft',
        { expectedRevision: 0, definition },
        true,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await mutate(
        f.admin.c,
        url + '/draft',
        { expectedRevision: 0, definition },
        true,
      )
    ).status,
  ).toBe(200);
  expect((await f.requester.c.agent.get(url)).body).not.toHaveProperty('draft');
  const publication = await mutate(f.admin.c, url + '/publish', {
    expectedRevision: 1,
  });
  expect(publication.body).not.toHaveProperty('error');
  expect(publication.status).toBe(201);
  const published = await f.requester.c.agent.get(url);
  expect(published.body.published.version).toBe(2);
  const opened = await mutate(f.requester.c, '/tickets', {
    ...f.input,
    answers: { app: 'Aplicativo aprovado' },
  });
  expect(opened.status).toBe(201);
  const snapshot = opened.body.ticket.serviceSnapshot;
  const next = {
    ...definition,
    fields: [{ ...field, label: 'Nome atualizado' }],
  };
  expect(
    (
      await mutate(
        f.admin.c,
        url + '/draft',
        { expectedRevision: 1, definition: next },
        true,
      )
    ).status,
  ).toBe(200);
  expect(
    (await mutate(f.admin.c, url + '/publish', { expectedRevision: 2 })).status,
  ).toBe(201);
  expect(
    (
      await database.db.ticket.findUniqueOrThrow({
        where: { id: opened.body.ticket.id },
      })
    ).serviceSnapshot,
  ).toEqual(snapshot);
  expect(
    (await f.admin.c.agent.get(url + '?version=2')).body.published.fields[0]
      .label,
  ).toBe('Aplicativo');
  expect((await f.requester.c.agent.get(url + '?version=2')).status).toBe(400);
});
it('rascunho rejeita condição inválida/opções duplicadas, revisão desatualizada e sessão sem CSRF', async () => {
  const f = await fixture(),
    url = '/services/' + f.service.id + '/form',
    definition = { title: 'Teste', description: '', fields: [] };
  expect(
    (
      await f.admin.c.agent
        .patch(url + '/draft')
        .set('Origin', origin)
        .send({ expectedRevision: 0, definition })
    ).status,
  ).toBe(403);
  expect(
    (
      await mutate(
        f.admin.c,
        url + '/draft',
        { expectedRevision: 0, definition },
        true,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await mutate(
        f.admin.c,
        url + '/draft',
        { expectedRevision: 0, definition },
        true,
      )
    ).status,
  ).toBe(409);
  const bad = {
    ...definition,
    fields: [
      {
        id: randomUUID(),
        key: 'x',
        label: 'x',
        type: 'SELECT',
        required: true,
        options: ['a', 'a'],
        condition: { field: 'missing', includes: 'a' },
      },
    ],
  };
  expect(
    (
      await mutate(
        f.admin.c,
        url + '/draft',
        { expectedRevision: 1, definition: bad },
        true,
      )
    ).status,
  ).toBe(400);
  expect(
    (await mutate(f.admin.c, url + '/publish', { expectedRevision: 2 })).status,
  ).toBe(409);
});
it('publicação concorrente gera uma versão; campos e metadados publicados são imutáveis', async () => {
  const f = await fixture(),
    url = '/services/' + f.service.id + '/form';
  const definition = {
    title: 'Tipos',
    description: '',
    fields: [
      {
        id: randomUUID(),
        key: 'quantity',
        label: 'Quantidade',
        type: 'NUMBER',
        required: true,
      },
      {
        id: randomUUID(),
        key: 'date',
        label: 'Data',
        type: 'DATE',
        required: true,
      },
      {
        id: randomUUID(),
        key: 'email',
        label: 'E-mail',
        type: 'EMAIL',
        required: true,
      },
      {
        id: randomUUID(),
        key: 'site',
        label: 'URL',
        type: 'URL',
        required: true,
      },
    ],
  };
  expect(
    (
      await mutate(
        f.admin.c,
        url + '/draft',
        { expectedRevision: 0, definition },
        true,
      )
    ).status,
  ).toBe(200);
  const second = await logged('ADMIN');
  const result = await Promise.all([
    mutate(f.admin.c, url + '/publish', { expectedRevision: 1 }),
    mutate(second.c, url + '/publish', { expectedRevision: 1 }),
  ]);
  expect(result.map((r) => r.status).sort()).toEqual([201, 409]);
  const read = await f.requester.c.agent.get(url);
  const form = read.body.published;
  await expect(
    database.db.serviceFormVersion.update({
      where: { id: form.id },
      data: { title: 'Não alterar' },
    }),
  ).rejects.toThrow();
  await expect(
    database.db.serviceFormField.update({
      where: { id: form.fields[0].id },
      data: { label: 'Não alterar' },
    }),
  ).rejects.toThrow();
  const answers = {
    quantity: 2,
    date: '2026-10-30',
    email: 'isolado@example.invalid',
    site: 'https://example.invalid/app',
  };
  expect(
    (await mutate(f.requester.c, '/tickets', { ...f.input, answers })).status,
  ).toBe(201);
  expect(
    (
      await mutate(f.requester.c, '/tickets', {
        ...f.input,
        answers: { ...answers, site: 'javascript:alert(1)' },
      })
    ).status,
  ).toBe(400);
  expect(
    await database.db.serviceFormVersion.count({
      where: { serviceId: f.service.id },
    }),
  ).toBe(2);
});
