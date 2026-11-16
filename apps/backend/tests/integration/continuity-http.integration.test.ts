import { it, expect } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import {
  d,
  fixture,
  account,
  mutate,
  started,
  origin,
} from './lifecycle-fixture.js';
import { syncReferenceCatalog } from '../../src/modules/catalog/sync-reference.js';
import { syncReferenceForms } from '../../src/modules/catalog/sync-forms.js';
import { syncSingleSystemForm } from '../../src/modules/catalog/sync-forms.js';
it('ADMIN não publica múltiplos sistemas no serviço canônico de criação de usuário', async () => {
  await syncReferenceCatalog(d.db, true);
  const admin = await account('ADMIN');
  const service = await d.db.service.findFirstOrThrow({
    where: { name: 'Criação de usuário' },
  });
  await d.db.serviceFormDraft.create({
    data: {
      serviceId: service.id,
      definition: {
        title: 'Criação de usuário',
        description: '',
        fields: [
          {
            id: randomUUID(),
            key: 'systems',
            label: 'Sistema',
            type: 'MULTI_SELECT',
            required: true,
            options: ['A', 'B'],
          },
        ],
      },
    },
  });
  const result = await mutate(
    admin.c,
    '/services/' + service.id + '/form/publish',
    { expectedRevision: 1 },
  );
  expect(result.status).toBe(400);
  expect(result.body.error.message).toContain('seleção única');
  expect(
    await d.db.serviceFormVersion.count({ where: { serviceId: service.id } }),
  ).toBe(1);
});
it('abertura real rejeita vários sistemas e aceita uma seleção única com respostas persistidas', async () => {
  await syncReferenceCatalog(d.db, true);
  await syncReferenceForms(d.db, true);
  const requester = await account('REQUESTER');
  const service = await d.db.service.findFirstOrThrow({
    where: { name: 'Criação de usuário' },
  });
  const input = {
    serviceId: service.id,
    subject: 'Criação de acesso',
    description: 'Solicitação isolada',
    answers: {
      systems: ['TOTVS', 'Spark'],
      fullName: 'Pessoa de teste',
      department: 'Tecnologia',
    },
  };
  expect((await mutate(requester.c, '/tickets', input)).status).toBe(400);
  const valid = await mutate(requester.c, '/tickets', {
    ...input,
    answers: { ...input.answers, systems: 'Spark' },
  });
  expect(valid.status).toBe(201);
  expect(
    (
      await d.db.ticketAnswer.findFirstOrThrow({
        where: { ticketId: valid.body.ticket.id, fieldKey: 'systems' },
      })
    ).value,
  ).toBe('Spark');
  expect(await d.db.ticket.count()).toBe(1);
});
it('decisão de sistema único cria nova versão e conserva a versão histórica e outros campos', async () => {
  await syncReferenceCatalog(d.db, true);
  const service = await d.db.service.findFirstOrThrow({
    where: { name: 'Criação de usuário' },
  });
  const form = await d.db.serviceFormVersion.create({
    data: {
      serviceId: service.id,
      version: 2,
      title: 'Nome personalizado',
      fields: {
        create: [
          {
            key: 'systems',
            label: 'Sistema escolhido',
            type: 'MULTI_SELECT',
            required: true,
            options: ['TOTVS', 'Spark'],
            displayOrder: 0,
          },
          {
            key: 'detail',
            label: 'Detalhe personalizado',
            type: 'TEXT',
            required: false,
            displayOrder: 1,
          },
        ],
      },
    },
  });
  expect((await syncSingleSystemForm(d.db, false)).state).toBe('create');
  expect((await syncSingleSystemForm(d.db, true)).state).toBe('create');
  expect((await syncSingleSystemForm(d.db, true)).state).toBe('existing');
  expect(
    (
      await d.db.serviceFormField.findFirstOrThrow({
        where: { formVersionId: form.id, key: 'systems' },
      })
    ).type,
  ).toBe('MULTI_SELECT');
  const latest = await d.db.serviceFormVersion.findFirstOrThrow({
    where: { serviceId: service.id },
    orderBy: { version: 'desc' },
    include: { fields: true },
  });
  expect(latest.title).toBe('Nome personalizado');
  expect(latest.fields.find((f) => f.key === 'systems')?.type).toBe('SELECT');
  expect(latest.fields.find((f) => f.key === 'detail')?.label).toBe(
    'Detalhe personalizado',
  );
});

it('referências publicam formulários somente em serviços básicos; segunda execução não duplica', async () => {
  await syncReferenceCatalog(d.db, true);
  expect((await syncReferenceForms(d.db, false)).created).toBe(16);
  expect(await d.db.serviceFormVersion.count()).toBe(16);
  expect((await syncReferenceForms(d.db, true)).created).toBe(16);
  expect((await syncReferenceForms(d.db, true)).created).toBe(0);
  expect(await d.db.serviceFormVersion.count()).toBe(32);
  const installer = await d.db.service.findFirstOrThrow({
    where: { name: 'Instalação de aplicativo' },
    include: {
      forms: {
        orderBy: { version: 'desc' },
        take: 1,
        include: { fields: true },
      },
    },
  });
  expect(installer.forms[0]!.fields.map((f) => f.label)).toEqual(
    expect.arrayContaining([
      'Nome do aplicativo',
      'Motivo da instalação',
      'URL para instalação',
    ]),
  );
});

it('referências não substituem formulário configurado nem reativam serviço desativado', async () => {
  await syncReferenceCatalog(d.db, true);
  const installer = await d.db.service.findFirstOrThrow({
    where: { name: 'Instalação de aplicativo' },
  });
  await d.db.serviceFormVersion.create({
    data: {
      serviceId: installer.id,
      version: 2,
      title: 'Configuração própria',
    },
  });
  await d.db.service.update({
    where: { id: installer.id },
    data: { isActive: false },
  });
  const result = await syncReferenceForms(d.db, true);
  expect(result.items.find((i) => i.name === installer.name)?.state).toBe(
    'ignored',
  );
  expect(
    (await d.db.service.findUniqueOrThrow({ where: { id: installer.id } }))
      .isActive,
  ).toBe(false);
  expect(
    await d.db.serviceFormVersion.count({ where: { serviceId: installer.id } }),
  ).toBe(2);
});

it('responsável retira globalmente sem apagar ticket, snapshots, respostas ou eventos', async () => {
  const f = await fixture();
  await started(f);
  const admin = await account('ADMIN'),
    other = await account('TECHNICIAN');
  const before = await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } });
  expect(
    (
      await mutate(other.c, '/tickets/' + f.id + '/retirement', {
        reason: 'Tentativa cruzada',
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await mutate(f.r.c, '/tickets/' + f.id + '/retirement', {
        reason: 'Não autorizado',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/retirement', {
        reason: 'Retirada global autorizada',
      })
    ).status,
  ).toBe(200);
  for (const actor of [f.r, f.t, admin]) {
    expect((await actor.c.agent.get('/tickets/' + f.id)).status).toBe(404);
    expect(
      (await actor.c.agent.get('/tickets/' + f.id + '/conversation')).status,
    ).toBe(404);
    expect((await actor.c.agent.get('/tickets')).body.total).toBe(0);
  }
  expect((await admin.c.agent.get('/tickets/overview')).body.total).toBe(0);
  expect(await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } })).toEqual(
    before,
  );
  expect(
    await d.db.ticketEvent.count({ where: { ticketId: f.id } }),
  ).toBeGreaterThan(1);
  expect(
    await d.db.operationalRetirement.count({ where: { ticketId: f.id } }),
  ).toBe(1);
});

it('retirada exige CSRF, payload estrito e sessão vigente; concorrência não duplica', async () => {
  const f = await fixture();
  await started(f);
  expect(
    (
      await f.t.c.agent
        .post('/tickets/' + f.id + '/retirement')
        .set('Origin', origin)
        .send({ reason: 'Sem CSRF' })
    ).status,
  ).toBe(403);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/retirement', {
        reason: 'Teste',
        role: 'ADMIN',
      })
    ).status,
  ).toBe(400);
  const [a, b] = await Promise.all([
    mutate(f.t.c, '/tickets/' + f.id + '/retirement', {
      reason: 'Primeira tentativa',
    }),
    mutate(f.t.c, '/tickets/' + f.id + '/retirement', {
      reason: 'Segunda tentativa',
    }),
  ]);
  expect([a.status, b.status].sort()).toEqual([200, 409]);
  // The loser may arrive after the first transaction committed. Ownership still
  // authorizes this conflict response; retirement must not turn it into a 404.
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/retirement', {
        reason: 'Repetição após confirmação',
      })
    ).status,
  ).toBe(409);
  expect(await d.db.operationalRetirement.count()).toBe(1);
});

it('ADMIN retira categoria e serviços ficam indisponíveis, mantendo todos os registros', async () => {
  const f = await fixture(),
    admin = await account('ADMIN');
  const ticket = await d.db.ticket.findUniqueOrThrow({
    where: { id: f.id },
    include: { service: true },
  });
  expect(
    (
      await mutate(admin.c, '/admin/retirements', {
        kind: 'category',
        id: ticket.service.categoryId,
        reason: 'Categoria retirada',
      })
    ).status,
  ).toBe(200);
  expect((await admin.c.agent.get('/categories')).body.total).toBe(0);
  expect((await f.r.c.agent.get('/services')).body.total).toBe(0);
  expect(
    (await admin.c.agent.get('/services/' + ticket.serviceId)).status,
  ).toBe(404);
  expect(await d.db.serviceCategory.count()).toBe(1);
  expect(await d.db.service.count()).toBe(1);
  expect(
    (
      await mutate(f.r.c, '/tickets', {
        serviceId: ticket.serviceId,
        subject: 'Outro chamado',
        description: 'Não deve abrir',
      })
    ).status,
  ).not.toBe(201);
  expect((await f.r.c.agent.get('/tickets/' + f.id)).status).toBe(200);
});

it('conta sem histórico pode ser excluída; sessão/histórico, própria conta e último ADMIN são preservados', async () => {
  const f = await fixture(),
    admin = await account('ADMIN');
  const unused = await d.db.user.create({
    data: {
      name: 'Conta sem uso',
      email: randomUUID() + '@example.invalid',
      role: 'REQUESTER',
      passwordHash: f.r.u.passwordHash,
    },
  });
  const csrf = (await admin.c.agent.get('/auth/csrf').set('Origin', origin))
    .body.csrfToken;
  const remove = (id: string) =>
    admin.c.agent
      .delete('/admin/users/' + id)
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .send({});
  const list = await admin.c.agent.get('/admin/users');
  expect(list.status).toBe(200);
  expect(
    list.body.items.find((u: { id: string }) => u.id === unused.id).canDelete,
  ).toBe(true);
  expect(
    list.body.items.find((u: { id: string }) => u.id === f.r.u.id).canDelete,
  ).toBe(false);
  expect((await remove(unused.id)).status).toBe(200);
  expect(await d.db.user.findUnique({ where: { id: unused.id } })).toBeNull();
  expect((await remove(f.r.u.id)).status).toBe(409);
  expect((await remove(admin.u.id)).status).toBe(409);
  expect(
    await d.db.user.findUnique({ where: { id: f.r.u.id } }),
  ).not.toBeNull();
});

it('solução aceita data efetiva, preserva registro real e encerra SLA no instante informado', async () => {
  const f = await fixture();
  await started(f);
  const solvedAt = new Date().toISOString();
  const result = await mutate(f.t.c, '/tickets/' + f.id + '/solution', {
    description: 'Atendimento concluído anteriormente',
    solvedAt,
  });
  expect(result.status).toBe(201);
  const t = await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } }),
    s = await d.db.ticketSolution.findUniqueOrThrow({
      where: { ticketId: f.id },
    });
  expect(t.status).toBe('RESOLVED');
  expect(t.resolvedAt?.toISOString()).toBe(solvedAt);
  expect(s.createdAt.getTime()).toBeGreaterThanOrEqual(Date.parse(solvedAt));
  const revision = await d.db.ticketSlaRevision.findFirstOrThrow({
    where: { ticketId: f.id },
  });
  expect(revision.endedAt?.toISOString()).toBe(solvedAt);
  expect(
    await d.db.ticketEvent.count({
      where: { ticketId: f.id, eventType: 'SOLUTION_ADDED' },
    }),
  ).toBe(1);
});

it('datas futuras ou anteriores ao início são recusadas sem solução parcial', async () => {
  const f = await fixture();
  await started(f);
  for (const solvedAt of [
    new Date(Date.now() + 86400000).toISOString(),
    '2000-01-01T00:00:00.000Z',
  ])
    expect(
      (
        await mutate(f.t.c, '/tickets/' + f.id + '/solution', {
          description: 'Data inválida',
          solvedAt,
        })
      ).status,
    ).toBe(400);
  expect(await d.db.ticketSolution.count()).toBe(0);
  expect(
    (await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } })).status,
  ).toBe('IN_PROGRESS');
});

it('rotas coletivas removidas não são expostas', async () => {
  const f = await fixture();
  for (const url of [
    '/occurrences',
    '/tickets/awaiting-validation',
    '/tickets/' + f.id + '/solution-attempts',
  ])
    expect((await f.r.c.agent.get(url)).status).toBe(404);
});
