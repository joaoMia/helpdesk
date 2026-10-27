import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { authTestDatabase } from './auth-database.js';
import { developmentFingerprint } from './review-database.js';
import {
  authorizationFixture,
  csrf,
  post,
  signIn,
  testOrigin,
} from './authorization-fixture.js';
import { createApp } from '../../src/app.js';

let database: Awaited<ReturnType<typeof authTestDatabase>>;
let data: Awaited<ReturnType<typeof authorizationFixture>>;
let development: Awaited<ReturnType<typeof developmentFingerprint>>;
beforeAll(async () => {
  development = await developmentFingerprint();
  database = await authTestDatabase();
  data = await authorizationFixture(database.db);
});
afterAll(async () => {
  if (database) await database.dispose();
  expect(await developmentFingerprint()).toEqual(development);
});
async function authenticated(key: keyof typeof data.users) {
  const client = data.setup();
  const response = await signIn(client, data.users[key].email, data.password);
  return {
    ...client,
    cookie: response.headers['set-cookie'] as unknown as string[],
  };
}
describe('HD-018 RBAC/ownership com autenticação e PostgreSQL reais', () => {
  it('solicitante lê somente o próprio chamado com respostas/histórico', async () => {
    const c = await authenticated('requesterA');
    const r = await c.agent.get('/probe/tickets/' + data.own.id);
    expect(r.status).toBe(200);
    expect(r.body.requesterId).toBe(data.users.requesterA.id);
    expect(r.body.answers[0].value).toBe('Resposta privada fictícia');
    expect(r.body.events[0].eventType).toBe('OPENED');
  });
  it('recurso de outro solicitante e inexistente têm a mesma resposta', async () => {
    const c = await authenticated('requesterA');
    const hidden = await c.agent.get('/probe/tickets/' + data.other.id),
      missing = await c.agent.get('/probe/tickets/' + randomUUID());
    expect(hidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(hidden.body).toEqual(missing.body);
    expect(JSON.stringify(hidden.body)).not.toMatch(
      /Descrição|privada|requesterId/,
    );
  });
  it('técnico tem detalhes somente dos chamados atribuídos a ele', async () => {
    const c = await authenticated('technicianA');
    expect(
      (await c.agent.get('/probe/tickets/' + data.assignedA.id)).status,
    ).toBe(200);
    for (const id of [data.assignedB.id, data.own.id, data.classified.id])
      expect((await c.agent.get('/probe/tickets/' + id)).status).toBe(404);
    expect(
      (await post(c, '/probe/tickets/' + data.assignedB.id + '/update')).status,
    ).toBe(404);
    expect(
      (await post(c, '/probe/tickets/' + data.assignedA.id + '/update')).status,
    ).toBe(204);
    expect(
      (await post(c, '/probe/tickets/' + data.closed.id + '/update')).status,
    ).toBe(404);
  });
  it('triagem lê somente metadados mínimos de chamados livres OPEN', async () => {
    const c = await authenticated('technicianA');
    const r = await c.agent.get('/probe/triage');
    expect(r.status).toBe(200);
    expect(new Set(r.body.map((row: { id: string }) => row.id))).toEqual(
      new Set([data.own.id, data.other.id, data.classified.id]),
    );
    for (const row of r.body)
      expect(Object.keys(row).sort()).toEqual([
        'code',
        'createdAt',
        'id',
        'priority',
        'status',
      ]);
    expect(JSON.stringify(r.body)).not.toMatch(
      /subject|description|answers|Snapshot|requester|email|privada/,
    );
  });
  it('solicitante não classifica/assume/atualiza nem executa administração', async () => {
    const c = await authenticated('requesterA');
    for (const action of ['classify', 'start', 'update'])
      expect(
        (await post(c, `/probe/tickets/${data.own.id}/${action}`)).status,
      ).toBe(403);
    expect((await post(c, '/probe/catalog')).status).toBe(403);
    expect((await c.agent.get('/probe/admin')).status).toBe(403);
    expect((await c.agent.get('/probe/triage')).status).toBe(403);
  });
  it('técnico não executa operação exclusiva do administrador', async () => {
    const c = await authenticated('technicianA');
    expect((await post(c, '/probe/catalog')).status).toBe(403);
    expect(
      (
        await post(
          c,
          '/probe/technicians/' + data.users.technicianB.id + '/manage',
        )
      ).status,
    ).toBe(403);
  });
  it('admin gerencia somente recursos explicitamente autorizados e não vira técnico', async () => {
    const c = await authenticated('admin');
    expect((await post(c, '/probe/catalog')).status).toBe(204);
    expect((await c.agent.get('/probe/admin')).status).toBe(204);
    expect(
      (
        await post(
          c,
          '/probe/requesters/' + data.users.requesterA.id + '/manage',
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await post(
          c,
          '/probe/technicians/' + data.users.technicianA.id + '/manage',
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await post(
          c,
          '/probe/technicians/' + data.users.requesterA.id + '/manage',
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await post(
          c,
          '/probe/requesters/' + data.users.otherAdmin.id + '/manage',
        )
      ).status,
    ).toBe(404);
    for (const action of ['classify', 'start', 'update'])
      expect(
        (await post(c, `/probe/tickets/${data.classified.id}/${action}`))
          .status,
      ).toBe(403);
  });
  it('admin tem leitura global sem expor hashes ou sessões', async () => {
    const c = await authenticated('admin');
    const r = await c.agent.get('/probe/tickets');
    expect(r.body).toHaveLength(6);
    expect(
      (await c.agent.get('/probe/tickets/' + data.assignedB.id)).status,
    ).toBe(200);
    const user = await c.agent.get('/probe/users/' + data.users.technicianA.id);
    expect(user.status).toBe(200);
    expect(JSON.stringify([r.body, user.body])).not.toMatch(
      /passwordHash|tokenHash|refreshTokens|authSessions/,
    );
  });
  it('informações privadas de usuário têm ownership e projeção explícita', async () => {
    const c = await authenticated('requesterA');
    expect(
      (await c.agent.get('/probe/users/' + data.users.requesterA.id)).status,
    ).toBe(200);
    expect(
      (await c.agent.get('/probe/users/' + data.users.requesterB.id)).status,
    ).toBe(404);
    const tech = await authenticated('technicianA');
    expect(
      (await tech.agent.get('/probe/users/' + data.users.technicianB.id))
        .status,
    ).toBe(404);
  });
  it('política de edição própria não permite selecionar outra pessoa pelo identificador', async () => {
    for (const key of ['requesterA', 'technicianA'] as const) {
      const c = await authenticated(key);
      expect(
        (await post(c, '/probe/users/' + data.users[key].id + '/update'))
          .status,
      ).toBe(204);
      expect(
        (await post(c, '/probe/users/' + data.users.requesterB.id + '/update'))
          .status,
      ).toBe(404);
    }
  });
  it('Prisma recebe o escopo e a projeção antes de buscar ou agregar registros', async () => {
    const list = jest.spyOn(database.db.ticket, 'findMany'),
      group = jest.spyOn(database.db.ticket, 'groupBy');
    try {
      const c = await authenticated('requesterA');
      await c.agent.get('/probe/tickets').query({ status: 'OPEN' });
      await c.agent.get('/probe/counts').query({ status: 'OPEN' });
      const scoped = expect.objectContaining({
        where: {
          AND: [{ requesterId: data.users.requesterA.id }, { status: 'OPEN' }],
        },
      });
      expect(list).toHaveBeenCalledWith(scoped);
      expect(group).toHaveBeenCalledWith(scoped);
      const tech = await authenticated('technicianA');
      const triage = await tech.agent
        .get('/probe/triage')
        .query({ status: 'CLOSED' });
      expect(triage.body).toEqual([]);
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { status: 'OPEN', assignedTechnicianId: null },
              { status: 'CLOSED' },
            ],
          },
          select: {
            id: true,
            code: true,
            status: true,
            priority: true,
            createdAt: true,
          },
        }),
      );
    } finally {
      list.mockRestore();
      group.mockRestore();
    }
  });
  it('papel, usuário e permissões falsificados no body/headers não concedem autoridade', async () => {
    const c = await authenticated('requesterA');
    const token = await csrf(c);
    const r = await c.agent
      .post('/probe/catalog')
      .set('Origin', testOrigin)
      .set('X-CSRF-Token', token)
      .set('X-Role', 'ADMIN')
      .set('X-User-Id', data.users.admin.id)
      .set('Authorization', 'Bearer ADMIN')
      .send({
        role: 'ADMIN',
        userId: data.users.admin.id,
        permissions: ['services.update'],
      });
    expect(r.status).toBe(403);
    expect(
      (
        await c.agent
          .get('/probe/tickets/' + data.assignedB.id)
          .set('X-Role', 'ADMIN')
      ).status,
    ).toBe(404);
  });
  it('sem autenticação, nem headers de perfil ou identidade dão acesso', async () => {
    const c = data.setup();
    expect(
      (await c.agent.get('/probe/admin').set('X-Role', 'ADMIN')).status,
    ).toBe(401);
    expect((await c.agent.get('/probe/tickets/' + data.own.id)).status).toBe(
      401,
    );
  });
  it('sessão revogada deixa de autorizar inclusive com JWT reapresentado', async () => {
    const c = await authenticated('requesterA');
    expect((await post(c, '/auth/logout')).status).toBe(204);
    expect(
      (
        await request(c.app)
          .get('/probe/tickets/' + data.own.id)
          .set('Cookie', c.cookie)
      ).status,
    ).toBe(401);
  });
  it('JWT e sessão expirados são recusados pela cadeia de autorização', async () => {
    const c = await authenticated('requesterA');
    const session = await database.db.authSession.findFirstOrThrow({
      where: { userId: data.users.requesterA.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const expired = await c.service.signAccess(
      data.users.requesterA.id,
      session.id,
      new Date(Date.now() - 16 * 60000),
    );
    expect(
      (
        await request(c.app)
          .get('/probe/tickets')
          .set('Cookie', 'helpdesk.access=' + expired)
      ).status,
    ).toBe(401);
    await database.db.authSession.update({
      where: { id: session.id },
      data: {
        createdAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect((await c.agent.get('/probe/tickets')).status).toBe(401);
  });
  it('consulta ao PostgreSQL detecta conta inativa e mudança posterior de perfil', async () => {
    const c = await authenticated('admin');
    try {
      await database.db.user.update({
        where: { id: data.users.admin.id },
        data: { role: 'REQUESTER' },
      });
      expect((await post(c, '/probe/catalog')).status).toBe(403);
      await database.db.user.update({
        where: { id: data.users.admin.id },
        data: { isActive: false },
      });
      expect((await c.agent.get('/probe/tickets')).status).toBe(401);
    } finally {
      await database.db.user.update({
        where: { id: data.users.admin.id },
        data: { role: 'ADMIN', isActive: true },
      });
    }
  });
  it('troca obrigatória bloqueia operações comuns e mantém fluxo de troca disponível', async () => {
    const c = await authenticated('pending');
    expect((await c.agent.get('/probe/tickets')).status).toBe(403);
    expect((await c.agent.get('/probe/tickets')).body.error.code).toBe(
      'PASSWORD_CHANGE_REQUIRED',
    );
    expect((await c.agent.get('/auth/me')).status).toBe(200);
  });
  it('listas e agregações aplicam o mesmo escopo antes da leitura no banco', async () => {
    for (const [key, ids] of [
      ['requesterA', [data.own.id, data.assignedA.id, data.closed.id]],
      ['requesterB', [data.other.id, data.assignedB.id, data.classified.id]],
      ['technicianA', [data.assignedA.id, data.closed.id]],
      ['technicianB', [data.assignedB.id]],
    ] as const) {
      const c = await authenticated(key),
        r = await c.agent.get('/probe/tickets');
      expect(new Set(r.body.map((row: { id: string }) => row.id))).toEqual(
        new Set(ids),
      );
      const counts = await c.agent.get('/probe/counts');
      expect(
        counts.body.reduce(
          (total: number, row: { _count: { _all: number } }) =>
            total + row._count._all,
          0,
        ),
      ).toBe(ids.length);
      const open = await c.agent.get('/probe/counts').query({ status: 'OPEN' });
      expect(
        open.body.reduce(
          (total: number, row: { _count: { _all: number } }) =>
            total + row._count._all,
          0,
        ),
      ).toBe(key.startsWith('requester') ? (key === 'requesterA' ? 1 : 2) : 0);
    }
  });
  it('parâmetros manipulados não sobrescrevem where/ownership nem viram consulta Prisma', async () => {
    const c = await authenticated('requesterA');
    for (const query of [
      { requesterId: data.users.requesterB.id },
      { role: 'ADMIN' },
      { 'where[OR][0][requesterId]': data.users.requesterB.id },
      { assignedTechnicianId: data.users.technicianB.id },
    ])
      expect((await c.agent.get('/probe/tickets').query(query)).status).toBe(
        400,
      );
    expect((await c.agent.get('/probe/tickets/nao-e-uuid')).status).toBe(404);
    const filtered = await c.agent
      .get('/probe/tickets')
      .query({ status: 'OPEN', serviceId: data.serviceId });
    expect(filtered.body.map((r: { id: string }) => r.id)).toEqual([
      data.own.id,
    ]);
  });
  it('elegibilidade de classificação/início não altera estado nem atribuição', async () => {
    const c = await authenticated('technicianA');
    expect(
      (await post(c, `/probe/tickets/${data.own.id}/classify`)).status,
    ).toBe(204);
    expect((await post(c, `/probe/tickets/${data.own.id}/start`)).status).toBe(
      404,
    );
    expect(
      (await post(c, `/probe/tickets/${data.classified.id}/start`)).status,
    ).toBe(204);
    expect(
      (await post(c, `/probe/tickets/${data.assignedB.id}/classify`)).status,
    ).toBe(404);
    expect(
      await database.db.ticket.findUnique({
        where: { id: data.classified.id },
        select: { status: true, assignedTechnicianId: true, priority: true },
      }),
    ).toEqual({ status: 'OPEN', assignedTechnicianId: null, priority: 'HIGH' });
  });
  it('operações de teste continuam protegidas por Origin/CSRF e negação padrão', async () => {
    const c = await authenticated('admin');
    expect(
      (await c.agent.post('/probe/catalog').set('Origin', testOrigin).send({}))
        .status,
    ).toBe(403);
    expect(
      (
        await c.agent
          .get('/probe/admin')
          .set('Origin', 'https://evil.example.invalid')
      ).status,
    ).toBe(403);
    expect((await c.agent.get('/probe/no-roles')).status).toBe(403);
  });
  it('servidor real não publica probes nem endpoints de negócio', async () => {
    const c = data.setup(),
      app = createApp(c.auth);
    for (const path of [
      '/probe/admin',
      '/probe/tickets',
      '/tickets',
      '/users',
      '/services',
    ])
      expect((await request(app).get(path)).status).toBe(404);
  });
});
