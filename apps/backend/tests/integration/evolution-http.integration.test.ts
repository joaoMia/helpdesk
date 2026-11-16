import { randomUUID } from 'node:crypto';
import { it, expect } from '@jest/globals';
import { d, fixture, account, mutate, started } from './lifecycle-fixture.js';

it('dashboards próprios agregam apenas o escopo autenticado e a triagem não revela detalhes privados', async () => {
  const f = await fixture(),
    other = await account('REQUESTER'),
    admin = await account('ADMIN');
  expect((await other.c.agent.get('/dashboard/me')).body.total).toBe(0);
  const requester = await f.r.c.agent.get('/dashboard/me');
  expect(requester.status).toBe(200);
  expect(requester.body.total).toBe(1);
  expect(requester.body.recent[0].id).toBe(f.id);
  const before = await f.t.c.agent.get('/dashboard/me');
  expect(before.body).toMatchObject({
    total: 0,
    triageAvailable: 1,
    recent: [],
  });
  expect(JSON.stringify(before.body)).not.toContain(f.id);
  await started(f);
  const after = await f.t.c.agent.get('/dashboard/me');
  expect(after.body.total).toBe(1);
  expect(after.body.triageAvailable).toBe(0);
  expect((await admin.c.agent.get('/dashboard/me')).status).toBe(403);
  expect(
    (await f.r.c.agent.get('/dashboard/me?userId=' + other.u.id)).status,
  ).toBe(400);
});

it('ficha operacional legada não substitui o detalhe completo e retirada elimina ambos', async () => {
  const f = await fixture(),
    other = await account('TECHNICIAN');
  await started(f);
  const response = await other.c.agent.get('/tickets/' + f.id + '/operational');
  expect(response.status).toBe(200);
  expect(response.body.ticket).toMatchObject({
    id: f.id,
    status: 'IN_PROGRESS',
    canRetire: false,
  });
  expect(JSON.stringify(response.body)).not.toMatch(
    /subject|description|answers|Snapshot|attachments|requesterId|passwordHash/,
  );
  const detail = await other.c.agent.get('/tickets/' + f.id);
  expect(detail.status).toBe(200);
  expect(detail.body.ticket).toMatchObject({ id: f.id, status: 'IN_PROGRESS' });
  expect(
    (await f.r.c.agent.get('/tickets/' + f.id + '/operational')).status,
  ).toBe(403);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/retirement', {
        reason: 'Retirada sintética',
      })
    ).status,
  ).toBe(200);
  expect(
    (await other.c.agent.get('/tickets/' + f.id + '/operational')).status,
  ).toBe(404);
});

it('calendário ausente é distinguido de snapshot de solução legado e de cobertura válida', async () => {
  const f = await fixture(false);
  const empty = await f.r.c.agent.get('/tickets/' + f.id + '/metrics');
  expect(empty.status).toBe(200);
  expect(empty.body.diagnostics).toMatchObject({
    coverage: 'NONE',
    futureCalendarConfigured: false,
    solutionMeasurement: 'MISSING_SNAPSHOT',
  });
  expect(empty.body.metrics).toMatchObject({
    aSeconds: null,
    bSeconds: null,
    complete: false,
  });
});

it('solução com calendário completo disponibiliza tempos até solução sem produzir métricas finais artificiais', async () => {
  const f = await fixture();
  await started(f);
  const result = await mutate(f.t.c, '/tickets/' + f.id + '/solution', {
    description: 'Solução sintética',
    solvedAt: new Date().toISOString(),
  });
  expect(result.status).toBe(201);
  const measured = await f.r.c.agent.get('/tickets/' + f.id + '/metrics');
  expect(measured.body.solutionMetrics.complete).toBe(true);
  expect(measured.body.diagnostics.solutionMeasurement).toBe('AVAILABLE');
  expect(measured.body.frozen).toBe(false);
});

const input = {
  clientOperationId: randomUUID(),
  title: 'Solicitação fictícia',
  objective: 'Melhorar o processo de teste',
  need: 'Registrar uma necessidade sintética',
};
it('projetos registram solicitação e auditoria, isolam autores e negam permissões ou transições não aprovadas', async () => {
  const f = await fixture(),
    other = await account('REQUESTER'),
    admin = await account('ADMIN');
  const result = await mutate(f.r.c, '/projects', input);
  expect(result.status).toBe(201);
  const id = result.body.project.id;
  expect(result.body.project.code).toBeGreaterThan(0);
  expect((await f.r.c.agent.get('/projects')).body.total).toBe(1);
  expect((await other.c.agent.get('/projects')).body.total).toBe(0);
  expect((await other.c.agent.get('/projects/' + id)).status).toBe(404);
  expect((await other.c.agent.get('/projects/' + id + '/history')).status).toBe(
    404,
  );
  expect((await admin.c.agent.get('/projects?search=fict')).body.total).toBe(1);
  expect((await f.t.c.agent.get('/projects')).status).toBe(403);
  expect((await mutate(admin.c, '/projects', input)).status).toBe(403);
  expect(
    (await mutate(f.r.c, '/projects', { ...input, requesterId: other.u.id }))
      .status,
  ).toBe(400);
  expect((await f.r.c.agent.get('/projects?role=ADMIN')).status).toBe(400);
  expect(
    (await f.r.c.agent.get('/projects/' + id + '/history')).body.items,
  ).toEqual([expect.objectContaining({ type: 'REQUESTED' })]);
  expect((await mutate(f.r.c, '/projects/' + id + '/start', {})).status).toBe(
    403,
  );
  expect(await d.db.projectRequestEvent.count()).toBe(1);
});

it('projetos exigem CSRF e entrada válida; criações concorrentes têm códigos únicos e auditoria correspondente', async () => {
  const f = await fixture();
  expect((await f.r.c.agent.post('/projects').send(input)).status).toBe(403);
  expect(
    (await mutate(f.r.c, '/projects', { ...input, title: '' })).status,
  ).toBe(400);
  const results = await Promise.all([
    mutate(f.r.c, '/projects', input),
    mutate(f.r.c, '/projects', {
      ...input,
      title: 'Outra solicitação sintética',
      clientOperationId: randomUUID(),
    }),
  ]);
  expect(results.map((r) => r.status)).toEqual([201, 201]);
  expect(new Set(results.map((r) => r.body.project.code)).size).toBe(2);
  expect(await d.db.projectRequest.count()).toBe(2);
  expect(await d.db.projectRequestEvent.count()).toBe(2);
});

it('falha de auditoria do projeto desfaz criação integralmente', async () => {
  const f = await fixture();
  await d.db.$executeRawUnsafe(
    `CREATE FUNCTION "${d.schema}".reject_project_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'isolated rollback'; END $$`,
  );
  await d.db.$executeRawUnsafe(
    `CREATE TRIGGER reject_project_audit BEFORE INSERT ON "${d.schema}".project_request_events FOR EACH ROW EXECUTE FUNCTION "${d.schema}".reject_project_audit()`,
  );
  expect((await mutate(f.r.c, '/projects', input)).status).toBe(500);
  expect(await d.db.projectRequest.count()).toBe(0);
});
