import type { Prisma, TicketPriority } from '../../generated/prisma/client.js';
import { usefulTime } from './useful-time.js';
import { pendingSnapshotSchema } from '@helpdesk/contracts';
export async function finishSla(
  tx: Prisma.TransactionClient,
  ticketId: string,
  now: Date,
  reason: 'SOLUTION' | 'PRIORITY_CHANGED',
) {
  const current = await tx.ticketSlaRevision.findFirst({
    where: { ticketId, endedAt: null },
    include: { policyVersion: true },
  });
  if (!current) return;
  const result = current.startedAt
    ? await usefulTime(tx, ticketId, current.startedAt, now)
    : null;
  const consumed =
    result?.seconds == null || current.carriedSeconds === null
      ? null
      : result.seconds + (current.carriedSeconds ?? 0);
  await tx.ticketSlaRevision.update({
    where: { id: current.id },
    data: {
      endedAt: now,
      finishReason: reason,
      consumedSeconds: consumed,
      met:
        consumed == null
          ? null
          : consumed <= current.policyVersion.targetMinutes * 60,
    },
  });
}
export async function classifySla(
  tx: Prisma.TransactionClient,
  ticketId: string,
  priority: TicketPriority,
  now: Date,
) {
  await finishSla(tx, ticketId, now, 'PRIORITY_CHANGED');
  const policy = await tx.slaPolicyVersion.findFirstOrThrow({
      where: { priority },
      orderBy: { version: 'desc' },
    }),
    t = await tx.ticket.findUniqueOrThrow({
      where: { id: ticketId },
      select: { firstStartedAt: true },
    });
  await tx.ticketSlaRevision.create({
    data: {
      ticketId,
      priority,
      policyVersionId: policy.id,
      createdAt: now,
      startedAt: t.firstStartedAt ? now : null,
    },
  });
}
export async function startSla(
  tx: Prisma.TransactionClient,
  ticketId: string,
  priority: TicketPriority,
  now: Date,
) {
  const current = await tx.ticketSlaRevision.findFirst({
    where: { ticketId, endedAt: null },
  });
  if (current) {
    if (!current.startedAt)
      await tx.ticketSlaRevision.update({
        where: { id: current.id },
        data: { startedAt: now },
      });
    return current.policyVersionId;
  }
  // Legacy classifications predate policies. Bind explicitly now, never backdate.
  const policy = await tx.slaPolicyVersion.findFirstOrThrow({
    where: { priority },
    orderBy: { version: 'desc' },
  });
  await tx.ticketSlaRevision.create({
    data: {
      ticketId,
      priority,
      policyVersionId: policy.id,
      createdAt: now,
      startedAt: now,
    },
  });
  return policy.id;
}
export async function autoResumeRequester(
  tx: Prisma.TransactionClient,
  ticketId: string,
  userId: string,
  now: Date,
) {
  const t = await tx.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    select: { status: true, requesterId: true },
  });
  if (t.status !== 'PENDING' || t.requesterId !== userId) return;
  const period = await tx.ticketPendingPeriod.findFirst({
    where: { ticketId, endsAt: null },
  });
  if (
    !period ||
    !pendingSnapshotSchema.parse(period.snapshot).autoResumeOnRequesterActivity
  )
    return;
  await tx.ticketPendingPeriod.update({
    where: { id: period.id },
    data: { endsAt: now, endedById: userId },
  });
  await tx.ticket.update({
    where: { id: ticketId },
    data: { status: 'IN_PROGRESS' },
  });
  await tx.ticketEvent.create({
    data: {
      ticketId,
      actorId: userId,
      eventType: 'PENDING_AUTO_RESUMED',
      createdAt: now,
      oldValue: { status: 'PENDING' },
      newValue: { status: 'IN_PROGRESS', periodId: period.id },
    },
  });
}
