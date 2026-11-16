import { it, expect, jest } from '@jest/globals';
import { writeFileSync } from 'node:fs';
import { d, account, mutate, origin } from './lifecycle-fixture.js';

it('novo chamado com calendário prévio mede abertura, pendência, solução efetiva e encerramento separadamente', async () => {
  jest.useFakeTimers({
    doNotFake: [
      'performance',
      'hrtime',
      'nextTick',
      'queueMicrotask',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout',
    ],
  });
  const clock = (utc: string) =>
    jest.setSystemTime(new Date('2026-11-09T' + utc + ':00.000Z'));
  clock('10:00');
  try {
    const admin = await account('ADMIN'),
      r = await account('REQUESTER'),
      t = await account('TECHNICIAN');
    const schedule = await mutate(admin.c, '/admin/schedules', {
      name: 'Expediente sintético de aceite',
      timezone: 'America/Sao_Paulo',
      weekly: Array.from({ length: 5 }, (_, i) => [
        { day: i + 1, startMinute: 480, endMinute: 720 },
        { day: i + 1, startMinute: 780, endMinute: 1020 },
      ]).flat(),
      exceptions: [],
    });
    expect(schedule.status).toBe(201);
    const company = await mutate(admin.c, '/admin/companies', {
      name: 'Empresa sintética de aceite',
      workScheduleId: schedule.body.item.id,
    });
    expect(company.status).toBe(201);
    // Only this test's isolated accounts. Configuration precedes ticket creation.
    await d.db.user.updateMany({
      where: { id: { in: [r.u.id, t.u.id] } },
      data: { companyId: company.body.item.id },
    });
    const cat = await d.db.serviceCategory.create({
      data: { name: 'Categoria sintética' },
    });
    const service = await d.db.service.create({
      data: {
        name: 'Serviço sintético',
        categoryId: cat.id,
        forms: { create: { version: 1 } },
      },
    });
    const reason = await mutate(admin.c, '/admin/pending-reasons', {
      name: 'Aguardando retorno sintético',
      countsTowardSolution: false,
      autoResumeOnRequesterActivity: false,
    });
    expect(reason.status).toBe(201);
    async function at(utc: string, ...accounts: (typeof r)[]) {
      clock(utc);
      for (const a of accounts)
        expect((await mutate(a.c, '/auth/refresh', {})).status).toBe(200);
    }
    await at('11:00', r, t);
    const open = await mutate(r.c, '/tickets', {
      serviceId: service.id,
      subject: 'Aceite de calendário completo',
      description: 'Cenário inteiramente sintético',
    });
    expect(open.status).toBe(201);
    const id = open.body.ticket.id as string;
    const metrics = (await t.c.agent.get('/tickets/' + id + '/metrics')).status;
    expect(metrics).toBe(200);
    await at('11:15', t);
    const csrf = (await t.c.agent.get('/auth/csrf').set('Origin', origin)).body
      .csrfToken;
    expect(
      (
        await t.c.agent
          .patch('/tickets/' + id + '/priority')
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf)
          .send({ priority: 'MEDIUM', expectedPriority: null })
      ).status,
    ).toBe(200);
    await at('11:30', t);
    const assign = await mutate(t.c, '/tickets/' + id + '/assign', {
      technicianId: t.u.id,
      expectedPriority: 'MEDIUM',
    });
    expect(assign.status).toBe(200);
    expect(assign.body.ticket.firstStartedAt).toBeNull();
    const before = (await t.c.agent.get('/tickets/' + id + '/metrics')).body;
    expect(before.metrics.bSeconds).toBeNull();
    expect(before.metrics.complete).toBe(true);
    await at('12:00', t);
    expect((await mutate(t.c, '/tickets/' + id + '/start', {})).status).toBe(
      200,
    );
    const solutionDeadlineAt = Date.parse(
      (await t.c.agent.get('/tickets/' + id + '/metrics')).body
        .solutionDeadlineAt,
    );
    expect(
      Math.abs(solutionDeadlineAt - Date.parse('2026-11-11T12:00:00.000Z')),
    ).toBeLessThanOrEqual(1000);
    await at('13:00', t);
    expect(
      (
        await mutate(t.c, '/tickets/' + id + '/pending', {
          reasonId: reason.body.id,
          justification: 'Aguardando retorno no cenário de teste',
        })
      ).status,
    ).toBe(200);
    expect(
      (await t.c.agent.get('/tickets/' + id + '/metrics')).body
        .solutionDeadlineAt,
    ).toBeNull();
    await at('14:00', t);
    expect((await mutate(t.c, '/tickets/' + id + '/resume', {})).status).toBe(
      200,
    );
    await at('18:30', t);
    const solution = await mutate(t.c, '/tickets/' + id + '/solution', {
      description: 'Solução sintética registrada após o atendimento',
      solvedAt: '2026-11-09T18:00:00.000Z',
    });
    expect(solution.status).toBe(201);
    const resolved = (await t.c.agent.get('/tickets/' + id + '/metrics')).body;
    expect(resolved.diagnostics).toMatchObject({
      coverage: 'COMPLETE',
      solutionMeasurement: 'AVAILABLE',
    });
    expect(resolved.solutionMetrics).toMatchObject({
      complete: true,
      aSeconds: 18000,
      bSeconds: 14400,
      asOf: '2026-11-09T18:00:00.000Z',
    });
    expect(resolved.metrics).toMatchObject({
      complete: true,
      aSeconds: 19800,
      bSeconds: 16200,
    });
    expect(resolved.frozen).toBe(false);
    const sla = resolved.sla.find(
      (s: { finishReason: string }) => s.finishReason === 'SOLUTION',
    );
    expect(sla).toMatchObject({
      priority: 'MEDIUM',
      targetMinutes: 960,
      consumedSeconds: 14400,
      met: true,
      endedAt: '2026-11-09T18:00:00.000Z',
    });
    const ticket = await d.db.ticket.findUniqueOrThrow({ where: { id } });
    expect(ticket.status).toBe('RESOLVED');
    expect(ticket.finalMetrics).toBeNull();
    const audit = await d.db.ticketEvent.findFirstOrThrow({
      where: { ticketId: id, eventType: 'SOLUTION_ADDED' },
    });
    expect(audit.createdAt.toISOString()).toBe('2026-11-09T18:30:00.000Z');
    await at('19:00', t);
    expect((await mutate(t.c, '/tickets/' + id + '/close', {})).status).toBe(
      200,
    );
    const closed = (await t.c.agent.get('/tickets/' + id + '/metrics')).body;
    expect(closed.frozen).toBe(true);
    expect(closed.metrics).toMatchObject({
      complete: true,
      aSeconds: 21600,
      bSeconds: 18000,
      asOf: '2026-11-09T19:00:00.000Z',
    });
    expect(closed.sla).toEqual(resolved.sla);
    const segments = await d.db.ticketCalendarSegment.findMany({
      where: { ticketId: id },
      orderBy: { startsAt: 'asc' },
    });
    const pending = await d.db.ticketPendingPeriod.findFirstOrThrow({
      where: { ticketId: id },
    });
    expect(pending.startsAt.toISOString()).toBe('2026-11-09T13:00:00.000Z');
    expect(pending.endsAt?.toISOString()).toBe('2026-11-09T14:00:00.000Z');
    writeFileSync(
      new URL(
        '../../../../.local/evolucao/sla-validacao-nov06.json',
        import.meta.url,
      ),
      JSON.stringify(
        {
          testDatabase: 'helpdesk_test',
          synthetic: true,
          controlledTestClock: true,
          date: '2026-11-09',
          timezone: 'America/Sao_Paulo',
          weekly: ['08:00–12:00', '13:00–17:00'],
          events: {
            opened: '08:00',
            classified: '08:15',
            assigned: '08:30',
            started: '09:00',
            pending: '10:00–11:00',
            effectiveSolution: '15:00',
            solutionRecorded: '15:30',
            closed: '16:00',
          },
          resolved: {
            solutionMetrics: resolved.solutionMetrics,
            provisionalMetrics: resolved.metrics,
            sla,
            frozen: resolved.frozen,
          },
          closed: { metrics: closed.metrics, frozen: closed.frozen },
          calendar: segments.map((s) => ({
            startsAt: s.startsAt.toISOString(),
            endsAt: s.endsAt?.toISOString(),
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    jest.useRealTimers();
  }
}, 90000);
