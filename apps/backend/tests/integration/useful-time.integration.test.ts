import { it, expect } from '@jest/globals';
import { d, fixture } from './lifecycle-fixture.js';
import { usefulTime } from '../../src/modules/calendars/useful-time.js';
type Weekly = { day: number; startMinute: number; endMinute: number }[];
const week: Weekly = Array.from({ length: 5 }, (_, i) => [
  { day: i + 1, startMinute: 480, endMinute: 720 },
  { day: i + 1, startMinute: 780, endMinute: 1020 },
]).flat();
async function calendar(
  weekly = week,
  exceptions: {
    date: string;
    intervals: { startMinute: number; endMinute: number }[];
  }[] = [],
  timezone = 'America/Sao_Paulo',
) {
  return d.db.workSchedule.create({
    data: {
      name: 'Jornada histórica isolada',
      versions: {
        create: {
          version: 1,
          timezone,
          weekly,
          exceptions,
          createdAt: new Date('2026-01-01T00:00:00Z'),
        },
      },
    },
    include: { versions: true },
  });
}
async function measure(id: string, from: string, to: string) {
  return d.db.$transaction(
    (tx) => usefulTime(tx, id, new Date(from), new Date(to)),
    { timeout: 15000 },
  );
}
it('motor PostgreSQL respeita fuso, almoço e início fora do expediente', async () => {
  const f = await fixture(false),
    c = await calendar();
  await d.db.ticketCalendarSegment.create({
    data: {
      ticketId: f.id,
      versionId: c.versions[0]!.id,
      startsAt: new Date('2026-01-05T00:00:00Z'),
    },
  });
  expect(
    (await measure(f.id, '2026-01-05T06:00:00Z', '2026-01-05T19:00:00Z'))
      .seconds,
  ).toBe(7 * 3600);
  expect(
    (await measure(f.id, '2026-01-05T15:00:00Z', '2026-01-05T16:00:00Z'))
      .seconds,
  ).toBe(0);
});
it('noites e fins de semana não contam; sexta até segunda contém somente dois expedientes', async () => {
  const f = await fixture(false),
    c = await calendar();
  await d.db.ticketCalendarSegment.create({
    data: {
      ticketId: f.id,
      versionId: c.versions[0]!.id,
      startsAt: new Date('2026-01-01T00:00:00Z'),
    },
  });
  expect(
    (await measure(f.id, '2026-01-09T11:00:00Z', '2026-01-12T20:00:00Z'))
      .seconds,
  ).toBe(16 * 3600);
});
it('exceção por data substitui expediente e intervalo vazio representa folga', async () => {
  const f = await fixture(false),
    c = await calendar(week, [
      { date: '2026-01-05', intervals: [{ startMinute: 600, endMinute: 660 }] },
      { date: '2026-01-06', intervals: [] },
    ]);
  await d.db.ticketCalendarSegment.create({
    data: {
      ticketId: f.id,
      versionId: c.versions[0]!.id,
      startsAt: new Date('2026-01-01T00:00:00Z'),
    },
  });
  expect(
    (await measure(f.id, '2026-01-05T03:00:00Z', '2026-01-07T03:00:00Z'))
      .seconds,
  ).toBe(3600);
});
it('conversão nativa respeita mudança de horário de verão sem horas corridas artificiais', async () => {
  const f = await fixture(false),
    c = await calendar(
      [{ day: 0, startMinute: 60, endMinute: 240 }],
      [],
      'America/New_York',
    );
  await d.db.ticketCalendarSegment.create({
    data: {
      ticketId: f.id,
      versionId: c.versions[0]!.id,
      startsAt: new Date('2026-03-08T00:00:00Z'),
    },
  });
  expect(
    (await measure(f.id, '2026-03-08T05:00:00Z', '2026-03-08T10:00:00Z'))
      .seconds,
  ).toBe(2 * 3600);
});
it('segmentos versionados aplicam mudanças somente no futuro e expõem referências', async () => {
  const f = await fixture(false),
    c = await calendar();
  const v2 = await d.db.workScheduleVersion.create({
    data: {
      scheduleId: c.id,
      version: 2,
      timezone: 'America/Sao_Paulo',
      weekly: [{ day: 1, startMinute: 840, endMinute: 1080 }],
      exceptions: [],
      createdAt: new Date('2026-01-05T15:00:00Z'),
    },
  });
  await d.db.ticketCalendarSegment.create({
    data: {
      ticketId: f.id,
      versionId: c.versions[0]!.id,
      startsAt: new Date('2026-01-05T11:00:00Z'),
      endsAt: new Date('2026-01-05T15:00:00Z'),
    },
  });
  await d.db.ticketCalendarSegment.create({
    data: {
      ticketId: f.id,
      versionId: v2.id,
      startsAt: new Date('2026-01-05T15:00:00Z'),
    },
  });
  const result = await measure(
    f.id,
    '2026-01-05T11:00:00Z',
    '2026-01-05T20:00:00Z',
  );
  expect(result.seconds).toBe(7 * 3600);
  expect(result.calendarSegmentIds).toHaveLength(2);
  await expect(
    d.db.workScheduleVersion.update({
      where: { id: c.versions[0]!.id },
      data: { weekly: [] },
    }),
  ).rejects.toThrow();
});
it('pendência não contabilizável subtrai somente interseção útil e motivo alterado não reescreve snapshot', async () => {
  const f = await fixture(false),
    c = await calendar();
  await d.db.ticketCalendarSegment.create({
    data: {
      ticketId: f.id,
      versionId: c.versions[0]!.id,
      startsAt: new Date('2026-01-05T00:00:00Z'),
    },
  });
  const reason = await d.db.pendingReason.create({
    data: { name: 'Espera isolada', countsTowardSolution: false },
  });
  const p = await d.db.ticketPendingPeriod.create({
    data: {
      ticketId: f.id,
      reasonId: reason.id,
      startedById: f.t.u.id,
      endedById: f.t.u.id,
      startsAt: new Date('2026-01-05T14:00:00Z'),
      endsAt: new Date('2026-01-05T18:00:00Z'),
      justification: 'Aguardar retorno',
      snapshot: {
        name: reason.name,
        countsTowardSolution: false,
        autoResumeOnRequesterActivity: false,
      },
    },
  });
  await d.db.pendingReason.update({
    where: { id: reason.id },
    data: { countsTowardSolution: true },
  });
  const result = await measure(
    f.id,
    '2026-01-05T11:00:00Z',
    '2026-01-05T20:00:00Z',
  );
  expect(result.seconds).toBe(5 * 3600);
  expect(result.pendingPeriodIds).toEqual([p.id]);
});
it('cobertura ausente retorna desconhecido; pendência contabilizável não desconta', async () => {
  const f = await fixture(false),
    c = await calendar();
  await d.db.ticketCalendarSegment.create({
    data: {
      ticketId: f.id,
      versionId: c.versions[0]!.id,
      startsAt: new Date('2026-01-05T12:00:00Z'),
    },
  });
  expect(
    (await measure(f.id, '2026-01-05T11:00:00Z', '2026-01-05T20:00:00Z')).valid,
  ).toBe(false);
  const r = await d.db.pendingReason.create({
    data: { name: 'Espera com contagem', countsTowardSolution: true },
  });
  await d.db.ticketPendingPeriod.create({
    data: {
      ticketId: f.id,
      reasonId: r.id,
      startedById: f.t.u.id,
      startsAt: new Date('2026-01-05T13:00:00Z'),
      justification: 'Conta útil',
      snapshot: {
        name: r.name,
        countsTowardSolution: true,
        autoResumeOnRequesterActivity: false,
      },
    },
  });
  expect(
    (await measure(f.id, '2026-01-05T12:00:00Z', '2026-01-05T20:00:00Z'))
      .seconds,
  ).toBe(7 * 3600);
});
