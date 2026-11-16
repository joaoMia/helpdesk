import {
  Prisma,
  type WorkScheduleVersion,
} from '../../generated/prisma/client.js';
import { scheduleVersionSchema } from '@helpdesk/contracts';
export type Window = { start: number; end: number };
export function mergeWindows(input: Window[]) {
  const output: Window[] = [];
  for (const w of input
    .filter((v) => v.end > v.start)
    .sort((a, b) => a.start - b.start)) {
    const last = output.at(-1);
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end);
    else output.push({ ...w });
  }
  return output;
}
export function netSeconds(windows: Window[], excluded: Window[]) {
  return Math.floor(windowMilliseconds(netWindows(windows, excluded)) / 1000);
}
export function windowMilliseconds(windows: Window[]) {
  return windows.reduce((total, w) => total + w.end - w.start, 0);
}
function netWindows(windows: Window[], excluded: Window[]) {
  const pauses = mergeWindows(excluded);
  const result: Window[] = [];
  for (const w of mergeWindows(windows)) {
    let start = w.start;
    for (const p of pauses) {
      if (p.end <= start) continue;
      if (p.start >= w.end) break;
      if (p.start > start) result.push({ start, end: p.start });
      start = p.end;
      if (start >= w.end) break;
    }
    if (start < w.end) result.push({ start, end: w.end });
  }
  return result;
}
export function fullyCovered(segments: Window[], from: number, to: number) {
  if (to < from) return false;
  let end = from;
  for (const s of mergeWindows(segments)) {
    if (s.end <= from || s.start >= to) continue;
    if (s.start > end) return false;
    end = Math.max(end, s.end);
  }
  return end >= to;
}
export type UsefulResult = {
  valid: boolean;
  seconds: number | null;
  calendarSegmentIds: string[];
  pendingPeriodIds: string[];
};
export async function usefulTime(
  tx: Prisma.TransactionClient,
  ticketId: string,
  from: Date,
  to: Date,
): Promise<UsefulResult> {
  const { windows, issue, ...refs } = await usefulWindows(
    tx,
    ticketId,
    from,
    to,
  );
  return {
    ...refs,
    valid: issue === null,
    seconds:
      issue === null ? Math.floor(windowMilliseconds(windows) / 1000) : null,
  };
}

export async function usefulWindows(
  tx: Prisma.TransactionClient,
  ticketId: string,
  from: Date,
  to: Date,
) {
  const segments = await tx.ticketCalendarSegment.findMany({
    where: {
      ticketId,
      startsAt: { lt: to },
      OR: [{ endsAt: null }, { endsAt: { gt: from } }],
    },
    include: { version: true },
    orderBy: { startsAt: 'asc' },
  });
  const pending = await tx.$queryRaw<
    { id: string; startsAt: Date; endsAt: Date | null; snapshot: unknown }[]
  >`SELECT id,starts_at AS "startsAt",ends_at AS "endsAt",snapshot FROM ticket_pending_periods WHERE ticket_id=${ticketId}::uuid AND starts_at<${to} AND (ends_at IS NULL OR ends_at>${from})`;
  const refs = {
    calendarSegmentIds: segments.map((s) => s.id),
    pendingPeriodIds: pending.map((p) => p.id),
  };
  if (
    !fullyCovered(
      [
        ...segments.map((s) => ({
          start: s.startsAt.getTime(),
          end: (s.endsAt ?? to).getTime(),
        })),
      ],
      from.getTime(),
      to.getTime(),
    ) ||
    to.getTime() - from.getTime() > 36600 * 86400000
  )
    return { windows: [], issue: 'CALENDAR_GAP' as const, ...refs };
  const windows: Window[] = [];
  for (const segment of segments) {
    const begin = new Date(
        Math.max(from.getTime(), segment.startsAt.getTime()),
      ),
      end = new Date(Math.min(to.getTime(), (segment.endsAt ?? to).getTime()));
    const scheduled = await scheduleWindows(tx, segment.version, begin, end);
    if (!scheduled)
      return { windows: [], issue: 'INVALID_CALENDAR' as const, ...refs };
    windows.push(...scheduled);
  }
  const excluded: Window[] = [];
  for (const p of pending) {
    if (
      !p.snapshot ||
      typeof p.snapshot !== 'object' ||
      !('countsTowardSolution' in p.snapshot) ||
      typeof p.snapshot.countsTowardSolution !== 'boolean'
    )
      return { windows: [], issue: 'INVALID_PENDING' as const, ...refs };
    if (!p.snapshot.countsTowardSolution)
      excluded.push({
        start: p.startsAt.getTime(),
        end: (p.endsAt ?? to).getTime(),
      });
  }
  return { windows: netWindows(windows, excluded), issue: null, ...refs };
}

export async function scheduleWindows(
  tx: Prisma.TransactionClient,
  version: WorkScheduleVersion,
  begin: Date,
  end: Date,
) {
  const v = scheduleVersionSchema.safeParse({
    id: version.id,
    version: version.version,
    timezone: version.timezone,
    weekly: version.weekly,
    exceptions: version.exceptions,
    createdAt: version.createdAt.toISOString(),
  });
  if (!v.success) return null;
  const rows = await tx.$queryRaw<{ start: Date; end: Date }[]>(Prisma.sql`
   SELECT greatest((d+(f->>'startMinute')::int*interval '1 minute') AT TIME ZONE ${v.data.timezone},${begin}) AS start,
          least((d+(f->>'endMinute')::int*interval '1 minute') AT TIME ZONE ${v.data.timezone},${end}) AS end
   FROM generate_series((${begin}::timestamptz AT TIME ZONE ${v.data.timezone})::date::timestamp,(${end}::timestamptz AT TIME ZONE ${v.data.timezone})::date::timestamp,interval '1 day') d
   CROSS JOIN LATERAL jsonb_array_elements(coalesce(
    (SELECT e->'intervals' FROM jsonb_array_elements(${JSON.stringify(v.data.exceptions)}::jsonb) e WHERE e->>'date'=to_char(d,'YYYY-MM-DD')),
    (SELECT jsonb_agg(e) FROM jsonb_array_elements(${JSON.stringify(v.data.weekly)}::jsonb) e WHERE (e->>'day')::int=extract(dow FROM d)::int),'[]'::jsonb)) f`);
  return mergeWindows(
    rows.map((r) => ({ start: r.start.getTime(), end: r.end.getTime() })),
  );
}
