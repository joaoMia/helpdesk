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

async function category(c: Client, extra: object = {}) {
  const result = await mutate(c, '/categories', {
    name: 'Categoria isolada',
    ...extra,
  });
  expect(result.status).toBe(201);
  return result.body.item;
}
async function service(c: Client, categoryId: string, extra: object = {}) {
  const result = await mutate(c, '/services', {
    name: 'Serviço isolado',
    categoryId,
    ...extra,
  });
  expect(result.status).toBe(201);
  return result.body.item;
}
const opening = () => new TicketService(prismaTicketRepository(database.db));
describe('HD-025 catálogo real', () => {
  it('ADMIN cria, consulta, edita, desativa e reativa categoria sem exclusão', async () => {
    const { c } = await logged(),
      cat = await category(c, { description: 'Descrição', displayOrder: 3 });
    expect(cat.isActive).toBe(true);
    expect(cat.createdAt).toBeDefined();
    expect((await c.agent.get('/categories/' + cat.id)).body.item.id).toBe(
      cat.id,
    );
    const changed = await mutate(
      c,
      '/categories/' + cat.id,
      { name: 'Outro nome', isActive: false },
      true,
    );
    expect(changed.status).toBe(200);
    expect(changed.body.item.displayOrder).toBe(3);
    expect((await c.agent.get('/categories?status=inactive')).body.total).toBe(
      1,
    );
    expect(
      (await mutate(c, '/categories/' + cat.id, { isActive: true }, true))
        .status,
    ).toBe(200);
    expect((await c.agent.delete('/categories/' + cat.id)).status).toBe(404);
  });
  it('serviço e formulário vazio v1 são criados atomicamente e suportam abertura interna', async () => {
    const { c } = await logged(),
      cat = await category(c),
      s = await service(c, cat.id);
    const forms = await database.db.serviceFormVersion.findMany({
      where: { serviceId: s.id },
      include: { fields: true },
    });
    expect(forms).toHaveLength(1);
    expect(forms[0]!.version).toBe(1);
    expect(forms[0]!.fields).toEqual([]);
    const r = await account('REQUESTER');
    const ticket = await opening().open(r.id, {
      serviceId: s.id,
      subject: 'Teste',
      description: 'Sem campos adicionais',
    });
    expect(ticket.status).toBe('OPEN');
    expect(ticket.priority).toBeNull();
    expect(ticket.assignedTechnicianId).toBeNull();
    expect(ticket.serviceSnapshot.fields).toEqual([]);
    expect(
      await database.db.ticketAnswer.count({ where: { ticketId: ticket.id } }),
    ).toBe(0);
    expect(
      (
        await database.db.ticketEvent.findFirst({
          where: { ticketId: ticket.id },
        })
      )?.eventType,
    ).toBe('OPENED');
    expect(
      (await c.agent.post('/tickets').send({ serviceId: s.id })).status,
    ).toBe(404);
  });
  it('serviço ativo exige categoria ativa; falha não deixa serviço/formulário parcial', async () => {
    const { c } = await logged(),
      cat = await category(c, { isActive: false });
    expect(
      (await mutate(c, '/services', { name: 'Não criar', categoryId: cat.id }))
        .status,
    ).toBe(409);
    expect(await database.db.service.count()).toBe(0);
    expect(await database.db.serviceFormVersion.count()).toBe(0);
    const s = await service(c, cat.id, { isActive: false });
    expect(
      (await mutate(c, '/services/' + s.id, { isActive: true }, true)).status,
    ).toBe(409);
    expect(
      (
        await mutate(c, '/services', {
          name: 'Não criar',
          categoryId: randomUUID(),
        })
      ).status,
    ).toBe(404);
  });
  it('ADMIN edita serviço sem recriar formulário e pode desativar/reativar', async () => {
    const { c } = await logged(),
      cat = await category(c),
      s = await service(c, cat.id, { displayOrder: 7 });
    const form = await database.db.serviceFormVersion.findFirst({
      where: { serviceId: s.id },
    });
    const changed = await mutate(
      c,
      '/services/' + s.id,
      { name: 'Editado', description: 'Detalhes' },
      true,
    );
    expect(changed.status).toBe(200);
    expect(changed.body.item.displayOrder).toBe(7);
    expect(changed.body.item.isActive).toBe(true);
    expect(
      (await mutate(c, '/services/' + s.id, { isActive: false }, true)).status,
    ).toBe(200);
    expect(
      (await mutate(c, '/services/' + s.id, { isActive: true }, true)).status,
    ).toBe(200);
    expect(
      await database.db.serviceFormVersion.count({
        where: { serviceId: s.id },
      }),
    ).toBe(1);
    expect(
      (
        await database.db.serviceFormVersion.findFirst({
          where: { serviceId: s.id },
        })
      )?.id,
    ).toBe(form?.id);
    expect((await c.agent.delete('/services/' + s.id)).status).toBe(404);
  });
  it.each(['REQUESTER', 'TECHNICIAN'] as const)(
    '%s consulta somente catálogo disponível e não administra',
    async (role) => {
      const { c } = await logged(),
        cat = await category(c),
        inactiveCat = await category(c, { isActive: false });
      const visible = await service(c, cat.id),
        off = await service(c, cat.id, { isActive: false }),
        hidden = await service(c, inactiveCat.id, { isActive: false });
      const reader = await logged(role);
      let list = await reader.c.agent.get('/services');
      expect(list.status).toBe(200);
      expect(list.body.items.map((s: { id: string }) => s.id)).toEqual([
        visible.id,
      ]);
      expect(list.body.items[0].isActive).toBeUndefined();
      expect(list.body.items[0].createdAt).toBeUndefined();
      expect((await reader.c.agent.get('/categories')).body.total).toBe(1);
      expect(
        (await reader.c.agent.get('/categories/' + inactiveCat.id)).status,
      ).toBe(404);
      for (const id of [off.id, hidden.id, randomUUID()])
        expect((await reader.c.agent.get('/services/' + id)).status).toBe(404);
      expect(
        (await reader.c.agent.get('/services?status=inactive')).body.total,
      ).toBe(0);
      for (const path of ['/categories', '/services']) {
        expect(
          (
            await mutate(reader.c, path, {
              name: 'Proibido',
              categoryId: cat.id,
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await mutate(
              reader.c,
              path + '/' + (path === '/categories' ? cat.id : visible.id),
              { name: 'Proibido' },
              true,
            )
          ).status,
        ).toBe(403);
      }
      await mutate(c, '/categories/' + cat.id, { isActive: false }, true);
      list = await reader.c.agent.get('/services');
      expect(list.body.total).toBe(0);
      expect((await reader.c.agent.get('/services/' + visible.id)).status).toBe(
        404,
      );
      expect(
        (
          await database.db.service.findUniqueOrThrow({
            where: { id: visible.id },
          })
        ).isActive,
      ).toBe(true);
    },
  );
  it('edição e desativação preservam snapshots; transferência de serviço utilizado é bloqueada', async () => {
    const { c } = await logged(),
      cat = await category(c),
      next = await category(c, { name: 'Destino' }),
      s = await service(c, cat.id),
      r = await account('REQUESTER');
    const ticket = await opening().open(r.id, {
      serviceId: s.id,
      subject: 'Histórico',
      description: 'Preservar',
    });
    const before = await database.db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(
      (await mutate(c, '/services/' + s.id, { categoryId: next.id }, true))
        .status,
    ).toBe(409);
    expect(
      (
        await mutate(
          c,
          '/services/' + s.id,
          { name: 'Novo nome', isActive: false },
          true,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await mutate(
          c,
          '/categories/' + cat.id,
          { name: 'Categoria alterada', isActive: false },
          true,
        )
      ).status,
    ).toBe(200);
    const after = await database.db.ticket.findUniqueOrThrow({
      where: { id: ticket.id },
    });
    expect(after).toEqual(before);
    await expect(
      opening().open(r.id, {
        serviceId: s.id,
        subject: 'Não abrir',
        description: 'Indisponível',
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(await database.db.ticket.count()).toBe(1);
    expect((await c.agent.get('/services/' + s.id)).body.item.name).toBe(
      'Novo nome',
    );
  });
  it('categoria inativa bloqueia abertura interna mesmo com serviço ativo', async () => {
    const { c } = await logged(),
      cat = await category(c),
      s = await service(c, cat.id),
      r = await account('REQUESTER');
    await mutate(c, '/categories/' + cat.id, { isActive: false }, true);
    await expect(
      opening().open(r.id, {
        serviceId: s.id,
        subject: 'Não abrir',
        description: 'Categoria inativa',
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(await database.db.ticket.count()).toBe(0);
  });
  it('serviço não utilizado pode mudar para outra categoria válida', async () => {
    const { c } = await logged(),
      cat = await category(c),
      next = await category(c, { name: 'Destino' }),
      s = await service(c, cat.id);
    const result = await mutate(
      c,
      '/services/' + s.id,
      { categoryId: next.id },
      true,
    );
    expect(result.status).toBe(200);
    expect(result.body.item.categoryId).toBe(next.id);
  });
  it('paginação, busca, ordenação e filtros são estáveis e recusam parâmetros não previstos', async () => {
    const { c } = await logged(),
      a = await category(c, { name: 'Primeira', displayOrder: 0 }),
      b = await category(c, { name: 'Segunda', displayOrder: 9 });
    await service(c, a.id, { name: 'Impressora' });
    await service(c, b.id, { name: 'Aplicativo' });
    expect(
      (await c.agent.get('/categories?pageSize=1&page=2')).body.items[0].id,
    ).toBe(b.id);
    expect((await c.agent.get('/services?search=impressora')).body.total).toBe(
      1,
    );
    expect(
      (await c.agent.get('/services?categoryId=' + b.id)).body.items[0].name,
    ).toBe('Aplicativo');
    expect((await c.agent.get('/services?pageSize=999')).status).toBe(400);
    expect((await c.agent.get('/categories?role=ADMIN')).status).toBe(400);
    expect((await c.agent.get('/services?categoryId=invalid')).status).toBe(
      400,
    );
  });
  it('campos financeiros, flags não previstas e edição de formulário são rejeitados', async () => {
    const { c } = await logged(),
      cat = await category(c),
      s = await service(c, cat.id);
    for (const field of ['price', 'billing', 'role', 'id', 'forms', 'fields']) {
      expect(
        (
          await mutate(c, '/services', {
            name: 'Não criar',
            categoryId: cat.id,
            [field]: 'forged',
          })
        ).status,
      ).toBe(400);
      expect(
        (await mutate(c, '/services/' + s.id, { [field]: 'forged' }, true))
          .status,
      ).toBe(400);
      expect(
        (await mutate(c, '/categories/' + cat.id, { [field]: 'forged' }, true))
          .status,
      ).toBe(400);
    }
    expect((await mutate(c, '/services/' + s.id, {}, true)).status).toBe(400);
    expect(
      (await mutate(c, '/categories/' + cat.id, { displayOrder: -1 }, true))
        .status,
    ).toBe(400);
  });
  it('sessões, CSRF, CORS, atividade e troca inicial continuam obrigatórios', async () => {
    expect((await setup().agent.get('/services')).status).toBe(401);
    const { c, user } = await logged();
    expect(
      (
        await c.agent
          .post('/categories')
          .set('Origin', origin)
          .send({ name: 'CSRF' })
      ).status,
    ).toBe(403);
    expect(
      (
        await c.agent
          .post('/services')
          .set('Origin', 'http://evil.invalid')
          .send({})
      ).status,
    ).toBe(403);
    await database.db.user.update({
      where: { id: user.id },
      data: { mustChangePassword: true },
    });
    expect((await c.agent.get('/categories')).status).toBe(403);
    await database.db.user.update({
      where: { id: user.id },
      data: { mustChangePassword: false, isActive: false },
    });
    expect((await c.agent.get('/categories')).status).toBe(401);
    await database.db.user.update({
      where: { id: user.id },
      data: { isActive: true },
    });
    await mutate(c, '/auth/logout', {});
    expect((await c.agent.get('/services')).status).toBe(401);
  });
  it('catálogo novo está vazio e não importa mocks ou seeds', async () => {
    const { c } = await logged();
    expect((await c.agent.get('/categories')).body.total).toBe(0);
    expect((await c.agent.get('/services')).body.total).toBe(0);
  });
  it('transferência concorrente com abertura não deixa snapshot incompatível', async () => {
    const { c } = await logged(),
      cat = await category(c),
      next = await category(c, { name: 'Destino concorrente' }),
      s = await service(c, cat.id),
      r = await account('REQUESTER');
    const [opened, moved] = await Promise.allSettled([
      opening().open(r.id, {
        serviceId: s.id,
        subject: 'Concorrente',
        description: 'Transacional',
      }),
      mutate(c, '/services/' + s.id, { categoryId: next.id }, true),
    ]);
    expect(moved.status).toBe('fulfilled');
    if (moved.status !== 'fulfilled') throw new Error('Falha HTTP inesperada');
    expect([200, 409]).toContain(moved.value.status);
    if (opened.status === 'fulfilled' && moved.value.status === 200)
      expect(opened.value.serviceSnapshot.categoryId).toBe(next.id);
    if (opened.status === 'rejected')
      expect(['P2034', 'P2010']).toContain(
        (opened.reason as { code: string }).code,
      );
    const count = await database.db.ticket.count();
    expect(count).toBe(opened.status === 'fulfilled' ? 1 : 0);
  });
});
