import { it, expect } from '@jest/globals';
import {
  d,
  fixture,
  account,
  mutate,
  started,
  upload,
  origin,
} from './lifecycle-fixture.js';
import { pendingSnapshotSchema } from '@helpdesk/contracts';
import { finishSla } from '../../src/modules/calendars/sla-clock.js';
it('avaliação de SLA marca orçamento excedido com janelas úteis e preserva revisão final', async () => {
  const f = await fixture(),
    a = await account('ADMIN');
  expect(
    (
      await mutate(a.c, '/admin/sla-policies', {
        priority: 'HIGH',
        targetMinutes: 1,
      })
    ).status,
  ).toBe(201);
  await started(f);
  const t = await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } }),
    end = new Date(t.firstStartedAt!.getTime() + 120000);
  await d.db.$transaction((tx) => finishSla(tx, f.id, end, 'SOLUTION'));
  const r = await d.db.ticketSlaRevision.findFirstOrThrow({
    where: { ticketId: f.id },
  });
  expect(r.consumedSeconds).toBe(120);
  expect(r.met).toBe(false);
  await expect(
    d.db.ticketSlaRevision.update({ where: { id: r.id }, data: { met: true } }),
  ).rejects.toThrow();
});
it('retomada preserva flag do período mesmo após alterar motivo; falha de auditoria desfaz fechamento', async () => {
  const f = await fixture();
  await started(f);
  const a = await account('ADMIN');
  const rid = await reason(a, true);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/pending', {
        reasonId: rid,
        justification: 'Aguardar retorno',
      })
    ).status,
  ).toBe(200);
  const token = (await a.c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  expect(
    (
      await a.c.agent
        .patch('/admin/pending-reasons/' + rid)
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ autoResumeOnRequesterActivity: false })
    ).status,
  ).toBe(200);
  expect(
    (
      await mutate(f.r.c, '/tickets/' + f.id + '/comments', {
        content: 'Retorno confirmado',
      })
    ).status,
  ).toBe(201);
  expect(
    (await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } })).status,
  ).toBe('IN_PROGRESS');
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/solution', {
        description: 'Solucionado',
      })
    ).status,
  ).toBe(201);
  await d.db.$executeRawUnsafe(
    `CREATE FUNCTION "${d.schema}".reject_close() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='TICKET_CLOSED' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
  );
  await d.db.$executeRawUnsafe(
    `CREATE TRIGGER reject_close BEFORE INSERT ON "${d.schema}".ticket_events FOR EACH ROW EXECUTE FUNCTION "${d.schema}".reject_close()`,
  );
  expect((await mutate(f.t.c, '/tickets/' + f.id + '/close', {})).status).toBe(
    500,
  );
  const t = await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } });
  expect(t.status).toBe('RESOLVED');
  expect(t.closedAt).toBeNull();
  expect(t.finalMetrics).toBeNull();
  expect(
    await d.db.ticketCalendarSegment.count({
      where: { ticketId: f.id, endsAt: null },
    }),
  ).toBe(1);
});
async function reason(
  admin: Awaited<ReturnType<typeof account>>,
  auto = false,
  counts = false,
) {
  const r = await mutate(admin.c, '/admin/pending-reasons', {
    name: 'Aguardando validação isolada',
    countsTowardSolution: counts,
    autoResumeOnRequesterActivity: auto,
  });
  expect(r.status).toBe(201);
  return r.body.id as string;
}
it('SLA inicial40/16/8 versionado; começa no primeiro início, não na classificação', async () => {
  const f = await fixture();
  const a = await account('ADMIN');
  const policies = await a.c.agent.get('/admin/sla-policies');
  expect(policies.status).toBe(200);
  expect(
    policies.body.items
      .map((p: { targetMinutes: number }) => p.targetMinutes)
      .sort((a: number, b: number) => a - b),
  ).toEqual([480, 960, 2400]);
  const token = (await f.t.c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  expect(
    (
      await f.t.c.agent
        .patch('/tickets/' + f.id + '/priority')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ priority: 'HIGH', expectedPriority: null })
    ).status,
  ).toBe(200);
  let r = await d.db.ticketSlaRevision.findFirstOrThrow({
    where: { ticketId: f.id },
  });
  expect(r.startedAt).toBeNull();
  expect(
    (await f.r.c.agent.get('/tickets/' + f.id + '/metrics')).body.metrics
      .bSeconds,
  ).toBeNull();
  expect((await mutate(f.t.c, '/tickets/' + f.id + '/start', {})).status).toBe(
    200,
  );
  r = await d.db.ticketSlaRevision.findUniqueOrThrow({ where: { id: r.id } });
  expect(r.startedAt).toEqual(
    (await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } }))
      .firstStartedAt,
  );
  expect(r.endedAt).toBeNull();
});
it('mudança posterior reinicia SLA; política nova não reescreve a meta vinculada', async () => {
  const f = await fixture();
  await started(f);
  const a = await account('ADMIN'),
    old = await d.db.ticketSlaRevision.findFirstOrThrow({
      where: { ticketId: f.id },
      include: { policyVersion: true },
    });
  expect(
    (
      await mutate(a.c, '/admin/sla-policies', {
        priority: 'HIGH',
        targetMinutes: 60,
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await d.db.ticketSlaRevision.findUniqueOrThrow({
        where: { id: old.id },
        include: { policyVersion: true },
      })
    ).policyVersion.targetMinutes,
  ).toBe(480);
  const token = (await f.t.c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  expect(
    (
      await f.t.c.agent
        .patch('/tickets/' + f.id + '/priority')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ priority: 'MEDIUM', expectedPriority: 'HIGH' })
    ).status,
  ).toBe(200);
  const rows = await d.db.ticketSlaRevision.findMany({
    where: { ticketId: f.id },
    orderBy: { createdAt: 'asc' },
  });
  expect(rows).toHaveLength(2);
  expect(rows[0]!.endedAt).not.toBeNull();
  expect(rows[0]!.finishReason).toBe('PRIORITY_CHANGED');
  expect(rows[1]!.startedAt).toEqual(rows[0]!.endedAt);
  expect(rows[1]!.priority).toBe('MEDIUM');
  expect(
    (await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } }))
      .firstStartedAt,
  ).toEqual(old.startedAt);
});
it('pendência exige motivo/justificativa, mantém snapshot e impede períodos simultâneos', async () => {
  const f = await fixture();
  await started(f);
  const a = await account('ADMIN'),
    rid = await reason(a);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/pending', {
        reasonId: rid,
        justification: '',
      })
    ).status,
  ).toBe(400);
  const results = await Promise.all([
    mutate(f.t.c, '/tickets/' + f.id + '/pending', {
      reasonId: rid,
      justification: 'Aguardando retorno',
    }),
    mutate(f.t.c, '/tickets/' + f.id + '/pending', {
      reasonId: rid,
      justification: 'Concorrente',
    }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  expect(
    await d.db.ticketPendingPeriod.count({
      where: { ticketId: f.id, endsAt: null },
    }),
  ).toBe(1);
  const csrf = (await a.c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  expect(
    (
      await a.c.agent
        .patch('/admin/pending-reasons/' + rid)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send({
          countsTowardSolution: true,
          autoResumeOnRequesterActivity: true,
          isActive: false,
        })
    ).status,
  ).toBe(200);
  const p = await d.db.ticketPendingPeriod.findFirstOrThrow({
    where: { ticketId: f.id },
  });
  expect(pendingSnapshotSchema.parse(p.snapshot).countsTowardSolution).toBe(
    false,
  );
  expect((await mutate(f.t.c, '/tickets/' + f.id + '/resume', {})).status).toBe(
    200,
  );
  expect(
    (await d.db.ticketPendingPeriod.findUniqueOrThrow({ where: { id: p.id } }))
      .endsAt,
  ).not.toBeNull();
});
it('retomada automática usa flag histórica e só interação confirmada do solicitante', async () => {
  const f = await fixture();
  await started(f);
  const a = await account('ADMIN'),
    rid = await reason(a, true);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/pending', {
        reasonId: rid,
        justification: 'Resposta necessária',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/comments', {
        content: 'Lembrete técnico',
      })
    ).status,
  ).toBe(201);
  expect(
    (await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } })).status,
  ).toBe('PENDING');
  expect(
    (
      await mutate(f.r.c, '/tickets/' + f.id + '/comments', {
        content: 'Retorno confirmado',
      })
    ).status,
  ).toBe(201);
  expect(
    (await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } })).status,
  ).toBe('IN_PROGRESS');
  expect(
    await d.db.ticketEvent.count({
      where: { ticketId: f.id, eventType: 'PENDING_AUTO_RESUMED' },
    }),
  ).toBe(1);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/pending', {
        reasonId: rid,
        justification: 'Enviar documento',
      })
    ).status,
  ).toBe(200);
  expect(
    (await upload(f.r.c, f.id, 'retorno.txt', Buffer.from('Retorno isolado')))
      .status,
  ).toBe(201);
  expect(
    (await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } })).status,
  ).toBe('IN_PROGRESS');
});
it('motivo sem retorno automático mantém pendência e ADMIN não herda operação técnica', async () => {
  const f = await fixture();
  await started(f);
  const a = await account('ADMIN'),
    rid = await reason(a);
  expect(
    (
      await mutate(a.c, '/tickets/' + f.id + '/pending', {
        reasonId: rid,
        justification: 'Não permitido',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/pending', {
        reasonId: rid,
        justification: 'Manual',
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await mutate(f.r.c, '/tickets/' + f.id + '/comments', {
        content: 'Resposta sem retorno automático',
      })
    ).status,
  ).toBe(201);
  expect(
    (await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } })).status,
  ).toBe('PENDING');
  expect((await mutate(f.r.c, '/tickets/' + f.id + '/resume', {})).status).toBe(
    403,
  );
});
it('solução termina SLA; fechamento por ADMIN ou responsável congela métricas e é atômico', async () => {
  const f = await fixture();
  await started(f);
  const a = await account('ADMIN');
  expect((await mutate(f.t.c, '/tickets/' + f.id + '/close', {})).status).toBe(
    409,
  );
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/solution', {
        description: 'Correção aplicada',
      })
    ).status,
  ).toBe(201);
  const before = await f.r.c.agent.get('/tickets/' + f.id + '/metrics');
  expect(before.status).toBe(200);
  expect(before.body.sla[0].finishReason).toBe('SOLUTION');
  expect(before.body.frozen).toBe(false);
  expect(before.body.solutionMetrics.complete).toBe(true);
  expect(before.body.solutionMetrics.bSeconds).not.toBeNull();
  const results = await Promise.all([
    mutate(f.t.c, '/tickets/' + f.id + '/close', {}),
    mutate(a.c, '/tickets/' + f.id + '/close', {}),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const t = await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } });
  expect(t.status).toBe('CLOSED');
  expect([a.u.id, f.t.u.id]).toContain(t.closedById);
  expect(t.resolvedAt).not.toEqual(t.closedAt);
  expect(
    await d.db.ticketEvent.count({
      where: { ticketId: f.id, eventType: 'TICKET_CLOSED' },
    }),
  ).toBe(1);
  const final = await f.r.c.agent.get('/tickets/' + f.id + '/metrics');
  expect(final.body.solutionMetrics).toEqual(before.body.solutionMetrics);
  expect(final.body.frozen).toBe(true);
  expect(final.body.metrics.aSeconds).not.toBeNull();
  expect(final.body.metrics.bSeconds).not.toBeNull();
  expect(
    (await f.r.c.agent.get('/tickets/' + f.id + '/metrics')).body.metrics,
  ).toEqual(final.body.metrics);
  expect(
    (
      await mutate(f.r.c, '/tickets/' + f.id + '/comments', {
        content: 'Não permitido',
      })
    ).status,
  ).toBe(409);
  await expect(
    d.db.ticket.update({ where: { id: f.id }, data: { priority: 'LOW' } }),
  ).rejects.toThrow();
});
it('sem cobertura histórica não encerra nem inventa tempo útil; B permanece independente', async () => {
  const f = await fixture(false);
  await started(f);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/solution', {
        description: 'Concluído sem calendário histórico',
      })
    ).status,
  ).toBe(201);
  const metrics = await f.r.c.agent.get('/tickets/' + f.id + '/metrics');
  expect(metrics.body.metrics.complete).toBe(false);
  expect(metrics.body.solutionMetrics.complete).toBe(false);
  expect(metrics.body.solutionMetrics.aSeconds).toBeNull();
  expect(metrics.body.metrics.aSeconds).toBeNull();
  expect((await mutate(f.t.c, '/tickets/' + f.id + '/close', {})).status).toBe(
    409,
  );
  expect(
    (await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } })).status,
  ).toBe('RESOLVED');
});
it('rotas novas negam acesso cruzado, payload privilegiado, CSRF, origem e perfis indevidos', async () => {
  const f = await fixture();
  await started(f);
  const other = await account('TECHNICIAN');
  expect(
    (await other.c.agent.get('/tickets/' + f.id + '/metrics')).status,
  ).toBe(200);
  expect(
    (await mutate(other.c, '/tickets/' + f.id + '/close', {})).status,
  ).toBe(404);
  expect((await f.r.c.agent.get('/admin/dashboard')).status).toBe(403);
  expect(
    (await mutate(f.r.c, '/admin/pending-reasons', { name: 'Negado' })).status,
  ).toBe(403);
  expect(
    (
      await f.t.c.agent
        .post('/tickets/' + f.id + '/close')
        .set('Origin', origin)
        .send({})
    ).status,
  ).toBe(403);
  expect(
    (
      await f.t.c.agent
        .get('/tickets/' + f.id + '/metrics')
        .set('Origin', 'https://invalid.example')
    ).status,
  ).toBe(403);
  expect(
    (await mutate(f.t.c, '/tickets/' + f.id + '/close', { role: 'ADMIN' }))
      .status,
  ).toBe(400);
});
it('dashboard agrega no backend, preserva empresa histórica e combina filtros sem vazar registros', async () => {
  const f = await fixture();
  const a = await account('ADMIN');
  let r = await a.c.agent.get('/admin/dashboard');
  expect(r.status).toBe(200);
  expect(r.body.total).toBe(1);
  expect(r.body.byCompany[0].name).toBe('Não informado');
  expect(
    (await a.c.agent.get('/admin/dashboard?companyId=' + a.u.id)).body.total,
  ).toBe(0);
  expect(
    (await a.c.agent.get('/admin/dashboard?status=OPEN&priority=HIGH')).body
      .total,
  ).toBe(0);
  await started(f);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/solution', {
        description: 'Resolvido',
      })
    ).status,
  ).toBe(201);
  const resolved = await a.c.agent.get('/admin/dashboard?status=RESOLVED');
  expect(resolved.status).toBe(200);
  expect(resolved.body).toMatchObject({
    total: 1,
    slaMet: 1,
    finalMetricsCount: 0,
    averageASeconds: null,
    averageBSeconds: null,
  });
  expect(resolved.body.monthly).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ resolved: 1, closed: 0 }),
    ]),
  );
  expect((await mutate(a.c, '/tickets/' + f.id + '/close', {})).status).toBe(
    200,
  );
  r = await a.c.agent.get(
    '/admin/dashboard?status=CLOSED&priority=HIGH&technicianId=' + f.t.u.id,
  );
  expect(r.status).toBe(200);
  expect(r.body.total).toBe(1);
  expect(r.body.finalMetricsCount).toBe(1);
  expect(r.body.slaMet).toBe(1);
  expect(
    r.body.monthly.reduce(
      (n: number, m: { closed: number }) => n + m.closed,
      0,
    ),
  ).toBe(1);
  expect(JSON.stringify(r.body)).not.toMatch(
    /passwordHash|storageKey|description|requesterId/,
  );
  expect((await a.c.agent.get('/admin/dashboard?role=ADMIN')).status).toBe(400);
  expect(
    (await a.c.agent.get('/admin/dashboard?from=2026-12-31&to=2026-01-01'))
      .status,
  ).toBe(400);
});
