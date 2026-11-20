import { it, expect } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { d, account, mutate, origin } from './lifecycle-fixture.js';
import type { ProjectWorkflow } from '@helpdesk/contracts';
const input = () => ({
  title: 'Projeto sintético',
  objective: 'Organizar um processo de teste',
  need: 'Atender necessidade fictícia',
  clientOperationId: randomUUID(),
});
const definition = () => ({
  stages: [
    {
      title: 'Etapa inicial',
      description: '',
      order: 1,
      activities: [
        { title: 'Primeira atividade', description: '', order: 1 },
        { title: 'Segunda atividade', description: '', order: 2 },
      ],
    },
  ],
});
async function context() {
  const r = await account('REQUESTER'),
    a = await account('ADMIN'),
    t = await account('TECHNICIAN');
  const created = await mutate(r.c, '/projects', input());
  expect(created.status).toBe(201);
  return { r, a, t, id: created.body.project.id as string };
}
type Context = Awaited<ReturnType<typeof context>>;
async function read(f: Context, c = f.a.c) {
  const result = await c.agent.get('/projects/' + f.id + '/workflow');
  expect(result.status).toBe(200);
  return result.body as ProjectWorkflow;
}
async function write(
  f: Context,
  op: string,
  c = f.a.c,
  body: Record<string, unknown> = {},
  revision?: number,
  key = randomUUID(),
) {
  const rev = revision ?? (await read(f, c)).revision;
  const token = (await c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  const request =
    op === 'plan-draft'
      ? c.agent.put('/projects/' + f.id + '/' + op)
      : op.startsWith('activities/')
        ? c.agent.patch('/projects/' + f.id + '/' + op)
        : c.agent.post('/projects/' + f.id + '/' + op);
  return request
    .set('Origin', origin)
    .set('X-CSRF-Token', token)
    .send({ expectedRevision: rev, clientOperationId: key, ...body });
}
it('REQUESTER não consegue definir prioridade diretamente na criação', async () => {
  const r = await account('REQUESTER');
  expect(
    (await mutate(r.c, '/projects', { ...input(), priority: 'HIGH' })).status,
  ).toBe(400);
});
async function planning(f: Context) {
  const result = await write(f, 'assignment', f.a.c, {
    technicianId: f.t.u.id,
    reason: 'Responsável de teste',
  });
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ state: 'PLANNING', startedAt: null });
}

it('atribuição abre planejamento na mesma revisão e libera edição e publicação ao responsável', async () => {
  const f = await context();
  const initial = await read(f);
  expect(
    (
      await write(
        f,
        'assignment',
        f.t.c,
        { technicianId: f.t.u.id, reason: 'Atribuição indevida' },
        initial.revision,
      )
    ).status,
  ).toBe(403);
  await planning(f);
  const w = await read(f, f.t.c);
  expect(w).toMatchObject({
    state: 'PLANNING',
    revision: initial.revision + 1,
    owner: { id: f.t.u.id },
    startedAt: null,
    permissions: { manage: true, publish: true },
  });
  const history = await f.r.c.agent.get(
    '/projects/' + f.id + '/workflow/history',
  );
  expect(history.body.items[0]).toMatchObject({
    kind: 'ASSIGNED',
    revision: w.revision,
    summary: expect.stringContaining('Em planejamento'),
  });
  expect(
    await d.db.projectWorkflowEvent.count({ where: { projectId: f.id } }),
  ).toBe(1);
  expect(
    (await write(f, 'planning', f.a.c, { reason: 'Operação removida' })).status,
  ).toBe(404);
  expect(
    (await write(f, 'plan-draft', f.r.c, { definition: definition() })).status,
  ).toBe(403);
  expect(
    (await write(f, 'plan-draft', f.t.c, { definition: definition() })).status,
  ).toBe(200);
  expect((await read(f, f.r.c)).draft).toBeNull();
  expect(
    (
      await write(f, 'plan-publication', f.t.c, {
        reason: 'Publicação confirmada',
      })
    ).status,
  ).toBe(200);
  expect((await read(f, f.r.c)).plan?.version).toBe(1);
});

it('projeto legado já atribuído muda de estado ao salvar o primeiro plano, sem alterar datas antigas', async () => {
  const f = await context();
  await d.db.projectWorkflow.create({
    data: { projectId: f.id, ownerId: f.t.u.id },
  });
  const legacy = await read(f, f.t.c);
  expect(legacy).toMatchObject({
    state: 'REQUESTED',
    permissions: { publish: true },
  });
  expect(
    await d.db.projectWorkflowEvent.count({ where: { projectId: f.id } }),
  ).toBe(0);
  const saved = await write(f, 'plan-draft', f.t.c, {
    definition: definition(),
  });
  expect(saved.status).toBe(200);
  expect(saved.body).toMatchObject({
    state: 'PLANNING',
    createdAt: legacy.createdAt,
    startedAt: null,
  });
  const event = await d.db.projectWorkflowEvent.findFirstOrThrow({
    where: { projectId: f.id },
  });
  expect(event).toMatchObject({
    kind: 'DRAFT_SAVED',
    revision: legacy.revision + 1,
    details: { previousState: 'REQUESTED', state: 'PLANNING' },
  });
  expect(
    (
      await write(f, 'plan-publication', f.t.c, {
        reason: 'Publicar planejamento legado',
      })
    ).status,
  ).toBe(200);
});
async function published(f: Context) {
  await planning(f);
  expect(
    (await write(f, 'plan-draft', f.t.c, { definition: definition() })).status,
  ).toBe(200);
  expect(
    (
      await write(f, 'plan-publication', f.t.c, {
        reason: 'Publicação inicial',
      })
    ).status,
  ).toBe(200);
}
async function running(f: Context) {
  await published(f);
  expect((await write(f, 'start', f.t.c)).status).toBe(200);
}

it('criação idempotente persiste resultado e preserva solicitação imutável e legado REQUESTED', async () => {
  const r = await account('REQUESTER'),
    payload = input();
  const [a, b] = await Promise.all([
    mutate(r.c, '/projects', payload),
    mutate(r.c, '/projects', payload),
  ]);
  expect([a.status, b.status]).toEqual([201, 201]);
  expect(a.body).toEqual(b.body);
  expect(await d.db.projectRequest.count()).toBe(1);
  expect(
    (
      await mutate(r.c, '/projects', {
        ...payload,
        title: 'Conteúdo diferente',
      })
    ).status,
  ).toBe(409);
  const id = a.body.project.id;
  expect(
    (await r.c.agent.get('/projects/' + id + '/workflow')).body,
  ).toMatchObject({
    state: 'REQUESTED',
    revision: 1,
    requesterName: r.u.name,
    owner: null,
    progress: null,
  });
  expect(await d.db.projectWorkflow.count()).toBe(0);
  await expect(
    d.db.projectRequest.update({
      where: { id },
      data: { title: 'Sobrescrita proibida' },
    }),
  ).rejects.toThrow();
});
it('prioridade é persistida no pedido, alterável por ADMIN com histórico e ausente no legado', async () => {
  const f = await context();
  expect(
    (await f.a.c.agent.get('/projects/' + f.id + '/workflow')).body.priority,
  ).toBeNull();
  expect(
    (
      await mutate(f.t.c, '/projects/' + f.id + '/priority', {
        expectedRevision: 1,
        clientOperationId: randomUUID(),
        priority: 'HIGH',
        reason: 'Tentativa técnica não autorizada',
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await write(f, 'priority', f.a.c, {
        priority: 'HIGH',
        reason: 'Classificação administrativa',
      })
    ).status,
  ).toBe(200);
  const current = await read(f);
  expect(current.priority).toBe('HIGH');
  expect(
    (
      await write(f, 'assignment', f.a.c, {
        technicianId: f.t.u.id,
        reason: 'Atribuição sintética',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await write(f, 'priority', f.t.c, {
        priority: 'MEDIUM',
        reason: 'Classificação pelo responsável',
      })
    ).status,
  ).toBe(200);
  expect((await read(f)).priority).toBe('MEDIUM');
  expect(
    (
      await f.a.c.agent.get('/projects/' + f.id + '/workflow/history')
    ).body.items.map((x: { kind: string }) => x.kind),
  ).toContain('PRIORITY_CHANGED');
});
it('exclui apenas rascunho em PLANNING e preserva histórico de versões publicadas', async () => {
  const f = await context();
  await planning(f);
  expect(
    (await write(f, 'plan-draft', f.t.c, { definition: definition() })).status,
  ).toBe(200);
  const draft = await read(f);
  const csrf = (await f.t.c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  expect(
    (
      await f.t.c.agent
        .delete('/projects/' + f.id + '/plan-draft')
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send({
          expectedRevision: draft.revision,
          clientOperationId: randomUUID(),
        })
    ).status,
  ).toBe(200);
  expect((await read(f)).draft).toBeNull();
  expect(
    (await f.a.c.agent.get('/projects/' + f.id + '/plan-versions')).body.total,
  ).toBe(0);
  expect(
    (
      await f.a.c.agent.get('/projects/' + f.id + '/workflow/history')
    ).body.items.map((x: { kind: string }) => x.kind),
  ).toContain('DRAFT_DELETED');
});
it('retirada operacional audita e preserva o registro sem expô-lo nas consultas', async () => {
  const f = await context();
  await planning(f);
  expect(
    (
      await write(f, 'retire', f.t.c, {
        reason: 'Projeto fictício retirado da operação',
      })
    ).status,
  ).toBe(200);
  expect(
    (await f.a.c.agent.get('/projects/' + f.id + '/workflow')).status,
  ).toBe(404);
  expect(
    await d.db.projectRequest.findUnique({ where: { id: f.id } }),
  ).not.toBeNull();
  expect(
    await d.db.operationalRetirement.findUnique({ where: { projectId: f.id } }),
  ).not.toBeNull();
});
it('ciclo completo não inicia ao atribuir nem conclui automaticamente por100%', async () => {
  const f = await context();
  await running(f);
  let w = await read(f);
  expect(w.state).toBe('IN_PROGRESS');
  expect(w.progress).toMatchObject({ done: 0, total: 2, percent: 0 });
  for (const activity of w.plan!.stages[0]!.activities)
    expect(
      (await write(f, 'activities/' + activity.id, f.t.c, { state: 'DONE' }))
        .status,
    ).toBe(200);
  w = await read(f);
  expect(w.state).toBe('IN_PROGRESS');
  expect(w.progress?.percent).toBe(100);
  expect(
    (
      await write(f, 'complete', f.t.c, {
        reason: 'Entrega realizada e conferida',
      })
    ).status,
  ).toBe(200);
  w = await read(f);
  expect(w.state).toBe('COMPLETED');
  expect(w.completedAt).not.toBeNull();
  expect(
    (await write(f, 'plan-draft', f.t.c, { definition: definition() })).status,
  ).toBe(409);
  expect(
    (await f.r.c.agent.get('/projects/' + f.id + '/workflow')).body.draft,
  ).toBeNull();
  expect(await d.db.projectRequestEvent.count()).toBe(1);
});
it('Feito conclui as atividades da etapa em uma revisão auditável com timestamp do servidor', async () => {
  const f = await context();
  await running(f);
  const before = await read(f),
    stage = before.plan!.stages[0]!;
  const result = await write(f, `stages/${stage.id}/complete`, f.t.c);
  expect(result.status).toBe(200);
  const after = await read(f),
    completed = after.plan!.stages[0]!;
  expect(completed.state).toBe('DONE');
  expect(completed.completedAt).not.toBeNull();
  expect(completed.activities.every((a) => a.state === 'DONE')).toBe(true);
  expect(after.progress).toMatchObject({ done: 2, total: 2, percent: 100 });
  expect(after.revision).toBe(before.revision + 1);
  const requesterView = await f.r.c.agent.get(
    '/projects/' + f.id + '/workflow',
  );
  expect(requesterView.body.requesterName).toBe(f.r.u.name);
  expect((await read(f, f.t.c)).requesterName).toBe(f.r.u.name);
  expect((await read(f, f.a.c)).requesterName).toBe(f.r.u.name);
  expect(requesterView.body.plan.stages[0].completedAt).toBe(
    completed.completedAt,
  );
  expect(requesterView.body.permissions.execute).toBe(false);
});
it('revisão publicada mantém identidade e estado, novas TODO, removidas no histórico', async () => {
  const f = await context();
  await running(f);
  let w = await read(f);
  const first = w.plan!.stages[0]!.activities[0]!;
  expect(
    (await write(f, 'activities/' + first.id, f.t.c, { state: 'DONE' })).status,
  ).toBe(200);
  w = await read(f);
  const stage = w.plan!.stages[0]!;
  const def = {
    stages: [
      {
        id: stage.id,
        title: stage.title,
        description: 'Revisado',
        order: 1,
        activities: [
          { id: first.id, title: first.title, description: '', order: 1 },
          { title: 'Nova atividade de revisão', description: '', order: 2 },
          { title: 'Outra atividade nova', description: '', order: 3 },
        ],
      },
    ],
  };
  expect(
    (await write(f, 'plan-draft', f.t.c, { definition: def })).status,
  ).toBe(200);
  expect(
    (
      await write(f, 'plan-publication', f.t.c, {
        reason: 'Tentativa sem autorização',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await write(f, 'plan-publication', f.a.c, {
        reason: 'Revisão justificada de escopo',
      })
    ).status,
  ).toBe(200);
  w = await read(f);
  expect(w.plan!.version).toBe(2);
  expect(w.plan!.stages[0]!.activities.map((a) => a.state)).toEqual([
    'DONE',
    'TODO',
    'TODO',
  ]);
  expect(w.progress?.percent).toBe(33);
  const old = await f.a.c.agent.get('/projects/' + f.id + '/plan-versions/1');
  expect(old.status).toBe(200);
  expect(old.body.stages[0].activities).toHaveLength(2);
  await expect(
    d.db
      .$executeRaw`UPDATE project_plan_stages SET title='Alteração indevida' WHERE plan_id=${old.body.id}::uuid`,
  ).rejects.toThrow();
  expect(
    (await f.r.c.agent.get('/projects/' + f.id + '/plan-draft')).status,
  ).toBe(403);
});
it('substituição revoga acesso do técnico anterior e mantém progresso', async () => {
  const f = await context();
  await running(f);
  const other = await account('TECHNICIAN');
  const activity = (await read(f)).plan!.stages[0]!.activities[0]!;
  expect(
    (await write(f, 'activities/' + activity.id, f.t.c, { state: 'DONE' }))
      .status,
  ).toBe(200);
  const w = await read(f);
  expect(w.progress).toMatchObject({ done: 1, total: 2, percent: 50 });
  expect(
    (
      await write(f, 'assignment', f.a.c, {
        technicianId: other.u.id,
        reason: 'Redistribuição autorizada',
      })
    ).status,
  ).toBe(200);
  expect(
    (await f.t.c.agent.get('/projects/' + f.id + '/workflow')).status,
  ).toBe(404);
  expect(await read(f, other.c)).toMatchObject({
    state: w.state,
    startedAt: w.startedAt,
    plan: w.plan,
    progress: w.progress,
    owner: { id: other.u.id },
  });
  expect(
    (await f.t.c.agent.get('/projects/workflows/dashboard')).body.total,
  ).toBe(0);
  expect(
    (await other.c.agent.get('/projects/workflows/dashboard')).body.total,
  ).toBe(1);
});
it('precondições, payload estrito, IDs cruzados e transições proibidas', async () => {
  const f = await context();
  expect((await write(f, 'start', f.a.c)).status).toBe(409);
  expect(
    (await write(f, 'plan-draft', f.a.c, { definition: definition() })).status,
  ).toBe(409);
  await planning(f);
  expect((await write(f, 'start', f.t.c)).status).toBe(409);
  expect(
    (
      await write(f, 'plan-draft', f.t.c, {
        definition: {
          stages: [{ ...definition().stages[0]!, id: randomUUID() }],
        },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await write(f, 'plan-draft', f.t.c, {
        definition: { stages: [{ ...definition().stages[0]!, order: 2 }] },
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await write(f, 'priority', f.t.c, {
        priority: 'HIGH',
        reason: 'Classificação com campo não permitido',
        percent: 100,
      })
    ).status,
  ).toBe(400);
  const requester = await write(f, 'cancel', f.r.c, {
    reason: 'Cancelamento após planejamento',
  });
  expect(requester.status).toBe(403);
});
it('cancelamento próprio somenteREQUESTED e ADMIN nos não terminais preserva história', async () => {
  const f = await context();
  expect(
    (await write(f, 'cancel', f.r.c, { reason: 'Necessidade não existe mais' }))
      .status,
  ).toBe(200);
  expect((await read(f)).state).toBe('CANCELED');
  expect(
    (
      await write(f, 'assignment', f.a.c, {
        technicianId: f.t.u.id,
        reason: 'Tentativa terminal',
      })
    ).status,
  ).toBe(409);
  expect(
    (await f.r.c.agent.get('/projects/' + f.id + '/history')).body.items,
  ).toHaveLength(1);
  const g = await context();
  await running(g);
  expect(
    (await write(g, 'cancel', g.a.c, { reason: 'Cancelamento administrativo' }))
      .status,
  ).toBe(200);
  expect((await read(g)).progress).toMatchObject({ total: 2, done: 0 });
});
it('idempotência recupera resultado original após revisão avançar; payload divergente409', async () => {
  const f = await context();
  await planning(f);
  const key = randomUUID(),
    rev = (await read(f)).revision,
    body = { definition: definition() };
  const a = await write(f, 'plan-draft', f.t.c, body, rev, key);
  expect(a.status).toBe(200);
  expect(
    (
      await write(f, 'priority', f.t.c, {
        priority: 'HIGH',
        reason: 'Avançando revisão',
      })
    ).status,
  ).toBe(200);
  const b = await write(f, 'plan-draft', f.t.c, body, rev, key);
  expect(b.status).toBe(200);
  expect(b.body).toEqual(a.body);
  expect(
    (
      await write(
        f,
        'plan-draft',
        f.t.c,
        { definition: { stages: [] } },
        rev,
        key,
      )
    ).status,
  ).toBe(409);
  expect(await d.db.projectPlanDraft.count()).toBe(1);
});
it('concorrência produz um vencedor e409, sem duplicação ou revisão perdida', async () => {
  const f = await context();
  await planning(f);
  const otherAdmin = await account('ADMIN'),
    rev = (await read(f)).revision;
  const result = await Promise.all([
    write(
      f,
      'priority',
      f.a.c,
      { priority: 'HIGH', reason: 'Decisão administrativa A' },
      rev,
    ),
    write(
      f,
      'priority',
      otherAdmin.c,
      { priority: 'LOW', reason: 'Decisão administrativa B' },
      rev,
    ),
  ]);
  expect(result.map((x) => x.status).sort()).toEqual([200, 409]);
  expect((await read(f)).revision).toBe(rev + 1);
  expect(
    await d.db.projectWorkflowEvent.count({
      where: { kind: 'PRIORITY_CHANGED' },
    }),
  ).toBe(1);
});
it('falha de auditoria desfaz estado, revisão, rascunho e idempotência', async () => {
  const f = await context();
  await planning(f);
  const rev = (await read(f)).revision;
  await d.db.$executeRawUnsafe(
    `CREATE FUNCTION "${d.schema}".reject_workflow_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated audit failure'; END $$`,
  );
  await d.db.$executeRawUnsafe(
    `CREATE TRIGGER reject_workflow_event BEFORE INSERT ON "${d.schema}".project_workflow_events FOR EACH ROW EXECUTE FUNCTION "${d.schema}".reject_workflow_event()`,
  );
  expect(
    (await write(f, 'plan-draft', f.t.c, { definition: definition() })).status,
  ).toBe(500);
  expect((await read(f)).revision).toBe(rev);
  expect(await d.db.projectPlanDraft.count()).toBe(0);
  expect(await d.db.projectOperation.count()).toBe(2);
  const unassigned = await context();
  const assignment = await write(unassigned, 'assignment', unassigned.a.c, {
    technicianId: unassigned.t.u.id,
    reason: 'Atribuição com falha de auditoria',
  });
  expect(assignment.status).toBe(500);
  expect(await read(unassigned)).toMatchObject({
    state: 'REQUESTED',
    owner: null,
    revision: 1,
  });
});
it('histórico unificado preserva cada atualização antiga uma vez e respeita ownership', async () => {
  const f = await context(),
    other = await account('REQUESTER');
  await running(f);
  const before = await read(f);
  const originals = await d.db.$transaction(async (tx) => {
    const records: { id: string; createdAt: Date }[] = [];
    for (const content of [
      'Andamento público autorizado',
      'Correção registrada',
    ]) {
      const { revision } = await tx.projectWorkflow.update({
        where: { projectId: f.id },
        data: { revision: { increment: 1 } },
      });
      const createdAt = new Date();
      const original = await tx.projectWorkflowUpdate.create({
        data: {
          projectId: f.id,
          actorId: f.t.u.id,
          createdAt,
          revision,
          content,
          correctionOf: records[0]?.id,
        },
      });
      records.push(original);
      await tx.projectWorkflowEvent.create({
        data: {
          projectId: f.id,
          actorId: f.t.u.id,
          createdAt,
          revision,
          kind: 'UPDATE_ADDED',
          summary: 'Registro anterior.',
        },
      });
    }
    return records;
  });
  for (const c of [f.r.c, f.t.c, f.a.c]) {
    const history = await c.agent.get(
      '/projects/' + f.id + '/workflow/history',
    );
    expect(history.status).toBe(200);
    expect(history.body.total).toBe(before.revision + 2);
    const records = history.body.items.filter(
      (item: { kind: string }) => item.kind === 'UPDATE_ADDED',
    );
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      id: originals[1]!.id,
      summary: 'Correção de atualização publicada.\nCorreção registrada',
      actor: f.t.u.name,
      createdAt: originals[1]!.createdAt.toISOString(),
    });
    expect(records[1]).toMatchObject({
      id: originals[0]!.id,
      summary: 'Atualização publicada.\nAndamento público autorizado',
    });
    expect(records[0]).not.toHaveProperty('details');
  }
  expect(
    (await other.c.agent.get('/projects/' + f.id + '/workflow/history')).status,
  ).toBe(404);
  for (const c of [f.a.c, f.t.c])
    expect(
      (await write(f, 'updates', c, { content: 'Nova atualização bloqueada' }))
        .status,
    ).toBe(404);
  expect(await d.db.projectWorkflowUpdate.count()).toBe(2);
  expect((await read(f)).revision).toBe(before.revision + 2);
  expect(
    (await other.c.agent.get('/projects/' + f.id + '/workflow')).status,
  ).toBe(404);
  expect(
    (await other.c.agent.get('/projects/workflows/dashboard')).body.total,
  ).toBe(0);
  const dash = await f.t.c.agent.get('/projects/workflows/dashboard');
  expect(dash.status).toBe(200);
  expect(dash.body.pendingActivities).toBe(2);
  expect(dash.body.byState).toContainEqual({ name: 'IN_PROGRESS', count: 1 });
  expect(
    (await f.a.c.agent.get('/projects/workflows?search=PR-&pageSize=1')).body
      .total,
  ).toBe(1);
});
it('técnicos inelegíveis, CSRF e sessão revogada bloqueiam mutações', async () => {
  const f = await context();
  await d.db.user.update({
    where: { id: f.t.u.id },
    data: { isActive: false },
  });
  expect(
    (
      await write(f, 'assignment', f.a.c, {
        technicianId: f.t.u.id,
        reason: 'Técnico inativo',
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.a.c.agent
        .post('/projects/' + f.id + '/assignment')
        .set('Origin', origin)
        .send({})
    ).status,
  ).toBe(403);
  await d.db.authSession.updateMany({
    where: { userId: f.a.u.id },
    data: { revokedAt: new Date() },
  });
  expect((await f.a.c.agent.get('/projects/workflows/dashboard')).status).toBe(
    401,
  );
});
it('retrabalho exige motivo e publicação/conclusão concorrentes não duplicam eventos', async () => {
  const f = await context();
  await running(f);
  const w = await read(f),
    activity = w.plan!.stages[0]!.activities[0]!;
  expect(
    (await write(f, 'activities/' + activity.id, f.t.c, { state: 'DONE' }))
      .status,
  ).toBe(200);
  expect(
    (await write(f, 'activities/' + activity.id, f.t.c, { state: 'TODO' }))
      .status,
  ).toBe(400);
  expect(
    (
      await write(f, 'activities/' + activity.id, f.t.c, {
        state: 'IN_PROGRESS',
        reason: 'Ajuste adicional identificado',
      })
    ).status,
  ).toBe(200);
  expect(
    (await write(f, 'complete', f.a.c, { reason: 'Ainda incompleto' })).status,
  ).toBe(409);
  const current = await read(f),
    key = randomUUID();
  const result = await Promise.all([
    write(
      f,
      'priority',
      f.t.c,
      { priority: 'HIGH', reason: 'Mesmo envio confirmado' },
      current.revision,
      key,
    ),
    write(
      f,
      'priority',
      f.t.c,
      { priority: 'HIGH', reason: 'Mesmo envio confirmado' },
      current.revision,
      key,
    ),
  ]);
  expect(result.map((r) => r.status)).toEqual([200, 200]);
  expect(result[0]!.body).toEqual(result[1]!.body);
  expect(
    await d.db.projectWorkflowEvent.count({
      where: { kind: 'PRIORITY_CHANGED' },
    }),
  ).toBe(1);
});
it('FKs e publicação vazia/imutável são protegidas no PostgreSQL', async () => {
  const f = await context();
  await published(f);
  const w = await read(f);
  await expect(
    d.db
      .$executeRaw`UPDATE project_plan_versions SET version=99 WHERE id=${w.plan!.id}::uuid`,
  ).rejects.toThrow();
  await expect(
    d.db.projectPlanVersion.create({
      data: {
        projectId: f.id,
        version: 2,
        actorId: f.a.u.id,
        createdAt: new Date(),
      },
    }),
  ).rejects.toThrow();
  await expect(
    d.db.projectWorkflowEvent.create({
      data: {
        projectId: randomUUID(),
        actorId: f.a.u.id,
        kind: 'UPDATE_ADDED',
        summary: 'Inválido',
        revision: 1,
        createdAt: new Date(),
      },
    }),
  ).rejects.toThrow();
  expect((await read(f)).plan?.version).toBe(1);
});
it('publicações concorrentes preservam versão única e identificadores de outros projetos são recusados', async () => {
  const f = await context();
  await planning(f);
  expect(
    (await write(f, 'plan-draft', f.t.c, { definition: definition() })).status,
  ).toBe(200);
  const rev = (await read(f)).revision,
    other = await account('ADMIN');
  const results = await Promise.all([
    write(f, 'plan-publication', f.a.c, { reason: 'Publicação A' }, rev),
    write(f, 'plan-publication', other.c, { reason: 'Publicação B' }, rev),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(await d.db.projectPlanVersion.count()).toBe(1);
  const g = await context();
  await running(g);
  const foreign = (await read(g)).plan!.stages[0]!.activities[0]!.id;
  expect(
    (
      await write(f, 'plan-draft', f.t.c, {
        definition: {
          stages: [
            {
              title: 'Etapa estrangeira',
              order: 1,
              activities: [
                { id: foreign, title: 'ID de outro projeto', order: 1 },
              ],
            },
          ],
        },
      })
    ).status,
  ).toBe(400);
});
it('cancelamento com revisão anterior ao planejamento retorna conflito, sem cancelar', async () => {
  const f = await context();
  const revision = (await read(f, f.r.c)).revision;
  expect(
    (
      await write(f, 'assignment', f.a.c, {
        technicianId: f.t.u.id,
        reason: 'Responsável definido',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await write(
        f,
        'cancel',
        f.r.c,
        { reason: 'Cancelamento baseado em leitura antiga' },
        revision,
      )
    ).status,
  ).toBe(409);
  expect((await read(f)).state).toBe('PLANNING');
});

it('responsáveis homônimos mantêm identidade própria nas agregações', async () => {
  const f = await context(),
    g = await context();
  await planning(f);
  await planning(g);
  expect(f.t.u.name).toBe(g.t.u.name);
  const result = await f.a.c.agent.get('/projects/workflows/dashboard');
  expect(result.status).toBe(200);
  expect(result.body.byOwner).toHaveLength(2);
  expect(
    new Set(result.body.byOwner.map((v: { id: string }) => v.id)).size,
  ).toBe(2);
  expect(
    result.body.byOwner.every((v: { count: number }) => v.count === 1),
  ).toBe(true);
});
it('leitura do detalhe respeita a projeção operacional do técnico responsável', async () => {
  const f = await context(),
    outsider = await account('TECHNICIAN'),
    foreign = await account('REQUESTER');
  await running(f);
  const get = (c: Context['a']['c'], path: string) =>
    c.agent.get('/projects/' + f.id + path);
  // Projeção operacional usada pela tela de detalhe: liberada ao responsável.
  for (const path of [
    '/workflow',
    '/workflow/history',
    '/submission',
    '/attachments',
    '/conversation',
  ])
    expect((await get(f.t.c, path)).status).toBe(200);
  // Leitura antiga projects.read permanece restrita a REQUESTER e ADMIN.
  for (const path of ['', '/history'])
    expect((await get(f.t.c, path)).status).toBe(403);
  for (const c of [f.r.c, f.a.c])
    for (const path of ['', '/history', '/workflow'])
      expect((await get(c, path)).status).toBe(200);
  // Técnico não atribuído e solicitante alheio não enxergam o projeto.
  for (const c of [outsider.c, foreign.c])
    for (const path of ['/workflow', '/workflow/history', '/conversation'])
      expect((await get(c, path)).status).toBe(404);
});
