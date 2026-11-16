import type { Prisma } from '../../generated/prisma/client.js';

export async function applicableSchedule(
  tx: Prisma.TransactionClient,
  userId: string,
  afterStart: boolean,
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      workScheduleId: true,
      company: { select: { workScheduleId: true } },
    },
  });
  const fallback = await tx.organizationSettings.findUnique({
    where: { id: 'organization' },
    select: { workScheduleId: true },
  });
  const id =
    (afterStart ? user?.workScheduleId : null) ??
    user?.company?.workScheduleId ??
    fallback?.workScheduleId;
  if (!id) return null;
  return tx.workScheduleVersion.findFirst({
    where: { scheduleId: id, schedule: { isActive: true } },
    orderBy: { version: 'desc' },
  });
}

export async function switchCalendar(
  tx: Prisma.TransactionClient,
  ticketId: string,
  versionId: string | null,
  now: Date,
  actorId?: string,
) {
  await tx.$queryRaw`SELECT id FROM tickets WHERE id=${ticketId}::uuid FOR UPDATE`;
  const current = await tx.ticketCalendarSegment.findFirst({
    where: { ticketId, endsAt: null },
  });
  if (current?.versionId === versionId) return;
  if (current)
    await tx.ticketCalendarSegment.update({
      where: { id: current.id },
      data: { endsAt: now },
    });
  if (versionId)
    await tx.ticketCalendarSegment.create({
      data: { ticketId, versionId, startsAt: now },
    });
  if (actorId)
    await tx.ticketEvent.create({
      data: {
        ticketId,
        actorId,
        eventType: 'CALENDAR_CHANGED',
        createdAt: now,
        newValue: { versionId },
      },
    });
}
