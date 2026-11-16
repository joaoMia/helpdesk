import { expect, it, jest } from '@jest/globals';
import {
  d,
  account,
  fixture,
  mutate,
  origin,
  started,
} from './lifecycle-fixture.js';

function useClock(stamp: string) {
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
  jest.setSystemTime(new Date(stamp));
}

async function schedule(admin: Awaited<ReturnType<typeof account>>) {
  const result = await mutate(admin.c, '/admin/schedules', {
    name: 'Jornada sintética para previsão',
    timezone: 'America/Sao_Paulo',
    weekly: Array.from({ length: 5 }, (_, i) => [
      { day: i + 1, startMinute: 480, endMinute: 720 },
      { day: i + 1, startMinute: 780, endMinute: 1020 },
    ]).flat(),
    exceptions: [{ date: '2026-11-16', intervals: [] }],
  });
  expect(result.status).toBe(201);
  return result.body.item.id as string;
}

it('projeta Alta, Média e Baixa a partir do primeiro início, com folga, fim de semana e pausa', async () => {
  useClock('2026-11-13T20:24:00Z');
  try {
    const f = await fixture(false);
    const admin = await account('ADMIN');
    const scheduleId = await schedule(admin);
    await d.db.user.update({
      where: { id: f.t.u.id },
      data: { workScheduleId: scheduleId },
    });
    const original = await d.db.ticket.findUniqueOrThrow({
      where: { id: f.id },
    });
    const deadline = async (id: string) => {
      const response = await f.t.c.agent.get('/tickets/' + id + '/metrics');
      expect(response.status).toBe(200);
      return response.body;
    };
    expect(await deadline(f.id)).toMatchObject({
      solutionDeadlineAt: null,
      solutionDeadlineReason: 'POLICY_MISSING',
    });
    for (const [priority, targetMinutes, expected] of [
      ['HIGH', 480, '2026-11-17T20:00:00.000Z'],
      ['MEDIUM', 960, '2026-11-18T20:00:00.000Z'],
      ['LOW', 2400, '2026-11-23T20:00:00.000Z'],
    ] as const) {
      const id =
        priority === 'HIGH'
          ? f.id
          : ((
              await mutate(f.r.c, '/tickets', {
                serviceId: original.serviceId,
                subject: 'Impressora de teste sem resposta',
                description: 'Chamado fictício com expediente configurado.',
              })
            ).body.ticket.id as string);
      const path = '/tickets/' + id;
      const csrf = (await f.t.c.agent.get('/auth/csrf').set('Origin', origin))
        .body.csrfToken;
      expect(
        (
          await f.t.c.agent
            .patch(path + '/priority')
            .set('Origin', origin)
            .set('X-CSRF-Token', csrf)
            .send({ priority, expectedPriority: null })
        ).status,
      ).toBe(200);
      expect(
        (
          await mutate(admin.c, path + '/assign', {
            technicianId: f.t.u.id,
            expectedPriority: priority,
          })
        ).status,
      ).toBe(200);
      expect(await deadline(id)).toMatchObject({
        solutionDeadlineAt: null,
        solutionDeadlineReason: 'NOT_STARTED',
        sla: [
          expect.objectContaining({ priority, targetMinutes, startedAt: null }),
        ],
      });
      jest.setSystemTime(new Date(Date.now() + 60000));
      expect((await mutate(f.t.c, path + '/start', {})).status).toBe(200);
      expect(await deadline(id)).toMatchObject({
        solutionDeadlineAt: expected,
        solutionDeadlineReason: null,
        metrics: { aSeconds: null, bSeconds: 0 },
        sla: [
          expect.objectContaining({
            priority,
            targetMinutes,
            consumedSeconds: 0,
          }),
        ],
      });
    }
    const reason = await mutate(admin.c, '/admin/pending-reasons', {
      name: 'Aguardando validação sintética',
      countsTowardSolution: false,
    });
    expect(reason.status).toBe(201);
    const path = '/tickets/' + f.id;
    jest.setSystemTime(new Date('2026-11-17T14:00:00Z'));
    expect((await mutate(f.t.c, '/auth/refresh', {})).status).toBe(200);
    expect(
      (
        await mutate(f.t.c, path + '/pending', {
          reasonId: reason.body.id,
          justification: 'Aguardando validação na fixture.',
        })
      ).status,
    ).toBe(200);
    expect(await deadline(f.id)).toMatchObject({
      solutionDeadlineAt: null,
      solutionDeadlineReason: 'SLA_SUSPENDED',
    });
    jest.setSystemTime(new Date('2026-11-17T17:00:00Z'));
    expect((await mutate(f.t.c, '/auth/refresh', {})).status).toBe(200);
    expect((await mutate(f.t.c, path + '/resume', {})).status).toBe(200);
    expect(await deadline(f.id)).toMatchObject({
      solutionDeadlineAt: '2026-11-18T13:00:00.000Z',
      metrics: { aSeconds: null, bSeconds: 10800 },
    });
    jest.setSystemTime(new Date('2026-11-18T14:00:00Z'));
    expect((await mutate(f.t.c, '/auth/refresh', {})).status).toBe(200);
    expect(await deadline(f.id)).toMatchObject({
      solutionDeadlineAt: '2026-11-18T13:00:00.000Z',
      sla: [expect.objectContaining({ remainingSeconds: -3600 })],
    });
    const segments = await d.db.ticketCalendarSegment.findMany({
      where: { ticketId: f.id },
    });
    expect(segments.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-11-13T20:25:00.000Z',
    ]);
  } finally {
    jest.useRealTimers();
  }
}, 90000);

it('distingue jornada ausente de lacuna após configurar calendário sem retroagir', async () => {
  useClock('2026-11-13T16:00:00Z');
  try {
    const f = await fixture(false);
    const admin = await account('ADMIN');
    await started(f);
    jest.setSystemTime(new Date('2026-11-13T16:01:00Z'));
    expect(
      (await f.t.c.agent.get('/tickets/' + f.id + '/metrics')).body,
    ).toMatchObject({
      solutionDeadlineAt: null,
      solutionDeadlineReason: 'CALENDAR_MISSING',
      metrics: { aSeconds: null, bSeconds: null },
    });
    const workScheduleId = await schedule(admin);
    const csrf = (await admin.c.agent.get('/auth/csrf').set('Origin', origin))
      .body.csrfToken;
    expect(
      (
        await admin.c.agent
          .patch('/admin/organization-default')
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf)
          .send({ workScheduleId })
      ).status,
    ).toBe(200);
    expect(
      (await f.t.c.agent.get('/tickets/' + f.id + '/metrics')).body,
    ).toMatchObject({
      solutionDeadlineAt: null,
      solutionDeadlineReason: 'CALENDAR_GAP',
      diagnostics: { futureCalendarConfigured: true },
      metrics: { aSeconds: null, bSeconds: null },
    });
    const segments = await d.db.ticketCalendarSegment.findMany({
      where: { ticketId: f.id },
    });
    expect(segments.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-11-13T16:01:00.000Z',
    ]);
  } finally {
    jest.useRealTimers();
  }
}, 90000);
