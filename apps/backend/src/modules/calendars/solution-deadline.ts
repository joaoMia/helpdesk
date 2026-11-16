import type { SolutionDeadlineReason } from '@helpdesk/contracts';
import type {
  Prisma,
  WorkScheduleVersion,
} from '../../generated/prisma/client.js';
import {
  scheduleWindows,
  usefulWindows,
  windowMilliseconds,
  type Window,
} from './useful-time.js';

export function unavailableDeadline(reason: SolutionDeadlineReason) {
  return { solutionDeadlineAt: null, solutionDeadlineReason: reason };
}

function deadline(at: number) {
  return {
    solutionDeadlineAt: new Date(at).toISOString(),
    solutionDeadlineReason: null,
  };
}

function reachTarget(windows: Window[], remaining: number) {
  for (const { start, end } of windows) {
    if (end - start >= remaining) return start + Math.ceil(remaining);
    remaining -= end - start;
  }
  return null;
}

export async function projectSolutionDeadline(
  tx: Prisma.TransactionClient,
  ticketId: string,
  now: Date,
  targetSeconds: number,
  carriedSeconds: number | null,
  elapsed: Awaited<ReturnType<typeof usefulWindows>>,
  suspended: boolean,
  applicableVersion: WorkScheduleVersion | null,
) {
  if (carriedSeconds === null || carriedSeconds >= targetSeconds)
    return unavailableDeadline('UNKNOWN_CONSUMPTION');
  if (elapsed.issue)
    return unavailableDeadline(
      elapsed.issue === 'CALENDAR_GAP' &&
        !elapsed.calendarSegmentIds.length &&
        !applicableVersion
        ? 'CALENDAR_MISSING'
        : elapsed.issue,
    );
  const budget = (targetSeconds - carriedSeconds) * 1000;
  const reached = reachTarget(elapsed.windows, budget);
  if (reached !== null) return deadline(reached);
  if (suspended) return unavailableDeadline('SLA_SUSPENDED');
  const segment = await tx.ticketCalendarSegment.findFirst({
    where: { ticketId, endsAt: null, startsAt: { lte: now } },
    include: { version: true },
  });
  const version = segment?.version ?? applicableVersion;
  if (!version) return unavailableDeadline('CALENDAR_MISSING');

  // Use the bound version for future dates. No inferred segments are stored.
  let remaining = budget - windowMilliseconds(elapsed.windows);
  let from = now;
  for (const days of [32, 334, 3294]) {
    const to = new Date(from.getTime() + days * 86400000);
    const windows = await scheduleWindows(tx, version, from, to);
    if (!windows) return unavailableDeadline('INVALID_CALENDAR');
    const projected = reachTarget(windows, remaining);
    if (projected !== null) return deadline(projected);
    remaining -= windowMilliseconds(windows);
    from = to;
  }
  return unavailableDeadline('NO_WORKING_TIME');
}
