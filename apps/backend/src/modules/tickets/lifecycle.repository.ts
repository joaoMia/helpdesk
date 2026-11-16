import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import { ticketScope } from '../authorization/ticket-scope.js';
import { resourceNotFound, forbidden } from '../authorization/permissions.js';
import { ApplicationError } from '../../shared/errors.js';
import {
  metricSnapshotSchema,
  pendingSnapshotSchema,
  adminPageQuerySchema,
} from '@helpdesk/contracts';
import {
  usefulTime,
  usefulWindows,
  windowMilliseconds,
} from '../calendars/useful-time.js';
import {
  projectSolutionDeadline,
  unavailableDeadline,
} from '../calendars/solution-deadline.js';
import type { TicketMetrics } from '@helpdesk/contracts';
import {
  applicableSchedule,
  switchCalendar,
} from '../calendars/calendar-segments.js';
import { containsText } from '../../shared/search.js';
import { Prisma as Sql } from '../../generated/prisma/client.js';
export const lifecycleConflict = (
  message = 'O chamado não permite esta operação. Atualize os dados.',
) => new ApplicationError('TICKET_CONFLICT', 409, message);
export async function metrics(
  tx: Prisma.TransactionClient,
  ticket: Prisma.TicketGetPayload<object>,
  now: Date,
) {
  if (ticket.finalMetrics)
    return metricSnapshotSchema.parse(ticket.finalMetrics);
  const end = ticket.closedAt ?? now,
    a = await usefulTime(tx, ticket.id, ticket.createdAt, end),
    b = ticket.firstStartedAt
      ? await usefulTime(tx, ticket.id, ticket.firstStartedAt, end)
      : null;
  return metricSnapshotSchema.parse({
    engineVersion: 1,
    asOf: end.toISOString(),
    aSeconds: a.seconds,
    bSeconds: b?.seconds ?? null,
    complete: a.valid && (!ticket.firstStartedAt || b?.valid === true),
    calendarSegmentIds: [
      ...new Set([...a.calendarSegmentIds, ...(b?.calendarSegmentIds ?? [])]),
    ],
    pendingPeriodIds: [
      ...new Set([...a.pendingPeriodIds, ...(b?.pendingPeriodIds ?? [])]),
    ],
  });
}
export class LifecycleRepository {
  constructor(readonly db: PrismaClient) {}
  async actor(tx: Prisma.TransactionClient, identity: Identity, admin = false) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
    const u = await tx.user.findUnique({ where: { id: identity.user.id } }),
      s = await tx.authSession.findUnique({
        where: { id: identity.sessionId },
      });
    if (
      !u ||
      !u.isActive ||
      u.mustChangePassword ||
      u.role !== identity.user.role ||
      !s ||
      s.userId !== u.id ||
      s.revokedAt ||
      s.expiresAt <= new Date()
    )
      throw invalidSession();
    if (admin && u.role !== 'ADMIN') throw forbidden();
    return u;
  }
  write(
    identity: Identity,
    id: string,
    operation: 'pause' | 'resume' | 'close',
    input: { reasonId?: string; justification?: string },
  ) {
    return this.db.$transaction(
      async (tx) => {
        const actor = await this.actor(tx, identity);
        if (operation !== 'close' && actor.role !== 'TECHNICIAN')
          throw forbidden();
        await tx.$queryRaw`SELECT id FROM tickets WHERE id=${id}::uuid FOR UPDATE`;
        const t = await tx.ticket.findFirst({
          where: { AND: [ticketScope(identity, 'tickets.read'), { id }] },
        });
        if (!t) throw resourceNotFound();
        if (
          !(actor.role === 'ADMIN' && operation === 'close') &&
          t.assignedTechnicianId !== actor.id
        )
          throw resourceNotFound();
        const now = new Date();
        if (operation === 'pause') {
          if (t.status !== 'IN_PROGRESS') throw lifecycleConflict();
          const r = await tx.pendingReason.findFirst({
            where: { id: input.reasonId, isActive: true },
          });
          if (!r) throw lifecycleConflict('Selecione um motivo ativo.');
          const p = await tx.ticketPendingPeriod.create({
            data: {
              ticketId: id,
              reasonId: r.id,
              justification: input.justification!,
              startsAt: now,
              startedById: actor.id,
              snapshot: {
                name: r.name,
                countsTowardSolution: r.countsTowardSolution,
                autoResumeOnRequesterActivity: r.autoResumeOnRequesterActivity,
              },
            },
          });
          await tx.ticket.update({
            where: { id },
            data: { status: 'PENDING' },
          });
          await tx.ticketEvent.create({
            data: {
              ticketId: id,
              actorId: actor.id,
              eventType: 'PENDING_STARTED',
              createdAt: now,
              oldValue: { status: 'IN_PROGRESS' },
              newValue: { status: 'PENDING', periodId: p.id },
            },
          });
        } else if (operation === 'resume') {
          if (t.status !== 'PENDING') throw lifecycleConflict();
          const p = await tx.ticketPendingPeriod.findFirst({
            where: { ticketId: id, endsAt: null },
          });
          if (!p) throw lifecycleConflict();
          await tx.ticketPendingPeriod.update({
            where: { id: p.id },
            data: { endsAt: now, endedById: actor.id },
          });
          await tx.ticket.update({
            where: { id },
            data: { status: 'IN_PROGRESS' },
          });
          await tx.ticketEvent.create({
            data: {
              ticketId: id,
              actorId: actor.id,
              eventType: 'PENDING_RESUMED',
              createdAt: now,
              oldValue: { status: 'PENDING' },
              newValue: { status: 'IN_PROGRESS', periodId: p.id },
            },
          });
        } else {
          if (
            t.status !== 'RESOLVED' ||
            !t.resolvedAt ||
            !t.firstStartedAt ||
            !(await tx.ticketSolution.findUnique({ where: { ticketId: id } }))
          )
            throw lifecycleConflict();
          const final = await metrics(tx, t, now);
          if (
            !final.complete ||
            final.aSeconds === null ||
            final.bSeconds === null
          )
            throw lifecycleConflict(
              'Não é possível encerrar: faltam referências históricas completas de calendário. Configure jornadas para novos períodos sem inventar dados do passado.',
            );
          if (
            await tx.ticketPendingPeriod.count({
              where: { ticketId: id, endsAt: null },
            })
          )
            throw lifecycleConflict();
          await switchCalendar(tx, id, null, now);
          await tx.ticket.update({
            where: { id },
            data: {
              status: 'CLOSED',
              closedAt: now,
              closedById: actor.id,
              finalMetrics: final,
            },
          });
          await tx.ticketEvent.create({
            data: {
              ticketId: id,
              actorId: actor.id,
              eventType: 'TICKET_CLOSED',
              createdAt: now,
              oldValue: { status: 'RESOLVED' },
              newValue: { status: 'CLOSED', engineVersion: 1 },
            },
          });
        }
        return {
          id,
          status:
            operation === 'pause'
              ? 'PENDING'
              : operation === 'resume'
                ? 'IN_PROGRESS'
                : 'CLOSED',
        };
      },
      { isolationLevel: 'Serializable', timeout: 20000 },
    );
  }
  read(identity: Identity, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const t = await tx.ticket.findFirst({
          where: { AND: [ticketScope(identity, 'tickets.read'), { id }] },
        });
        if (!t) throw resourceNotFound();
        const now = new Date(),
          m = await metrics(tx, t, now),
          revisions = await tx.ticketSlaRevision.findMany({
            where: { ticketId: id },
            include: { policyVersion: true },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          });
        const sla = [];
        const terminal = t.status === 'RESOLVED' || t.status === 'CLOSED';
        const pending = await tx.ticketPendingPeriod.findFirst({
          where: { ticketId: id, endsAt: null },
        });
        const snapshot = pending
          ? pendingSnapshotSchema.parse(pending.snapshot)
          : null;
        const futureCalendar = await applicableSchedule(
          tx,
          t.assignedTechnicianId ?? t.requesterId,
          !!t.firstStartedAt,
        );
        let projection: Pick<
          TicketMetrics,
          'solutionDeadlineAt' | 'solutionDeadlineReason'
        > = unavailableDeadline(terminal ? 'SLA_ENDED' : 'POLICY_MISSING');
        for (const r of revisions) {
          let consumed = r.consumedSeconds;
          if (!r.endedAt) {
            if (r.startedAt) {
              const elapsed = await usefulWindows(
                tx,
                id,
                r.startedAt,
                terminal ? (t.resolvedAt ?? now) : now,
              );
              consumed =
                elapsed.issue || r.carriedSeconds === null
                  ? null
                  : Math.floor(windowMilliseconds(elapsed.windows) / 1000) +
                    r.carriedSeconds;
              if (!terminal)
                projection = await projectSolutionDeadline(
                  tx,
                  id,
                  now,
                  r.policyVersion.targetMinutes * 60,
                  r.carriedSeconds,
                  elapsed,
                  snapshot?.countsTowardSolution === false,
                  futureCalendar,
                );
            } else if (!terminal) {
              projection = unavailableDeadline('NOT_STARTED');
            }
          }
          sla.push({
            id: r.id,
            priority: r.priority,
            targetMinutes: r.policyVersion.targetMinutes,
            policyVersion: r.policyVersion.version,
            startedAt: r.startedAt?.toISOString() ?? null,
            endedAt: r.endedAt?.toISOString() ?? null,
            consumedSeconds: consumed,
            remainingSeconds:
              consumed === null
                ? null
                : r.policyVersion.targetMinutes * 60 - consumed,
            met: r.met,
            finishReason: r.finishReason,
          });
        }
        const solutionEvent = await tx.ticketEvent.findFirst({
          where: {
            ticketId: id,
            eventType: { in: ['SOLUTION_ADDED', 'COLLECTIVE_SOLUTION_ADDED'] },
          },
          orderBy: { createdAt: 'desc' },
          select: { newValue: true },
        });
        const solutionMetrics = metricSnapshotSchema.safeParse(
          (solutionEvent?.newValue as { solutionMetrics?: unknown } | null)
            ?.solutionMetrics,
        );
        const segments = await tx.ticketCalendarSegment.count({
          where: { ticketId: id },
        });
        return {
          diagnostics: {
            coverage: !segments ? 'NONE' : m.complete ? 'COMPLETE' : 'GAP',
            futureCalendarConfigured: !!futureCalendar,
            solutionMeasurement: !solutionMetrics.success
              ? 'MISSING_SNAPSHOT'
              : solutionMetrics.data.complete
                ? 'AVAILABLE'
                : 'HISTORICAL_GAP',
          },
          solutionMetrics: solutionMetrics.success
            ? solutionMetrics.data
            : null,
          metrics: m,
          ...projection,
          frozen: !!t.finalMetrics,
          sla,
          activePending:
            pending && snapshot
              ? {
                  id: pending.id,
                  justification: pending.justification,
                  startsAt: pending.startsAt.toISOString(),
                  snapshot,
                }
              : null,
        };
      },
      { isolationLevel: 'RepeatableRead', timeout: 20000 },
    );
  }
  async reasons(
    q: ReturnType<typeof adminPageQuerySchema.parse>,
    admin: boolean,
  ) {
    const where = Sql.sql`WHERE ${admin && q.status === 'all' ? Sql.sql`TRUE` : Sql.sql`is_active=${admin ? q.status !== 'inactive' : true}`} AND ${q.search ? containsText(Sql.sql`name`, q.search) : Sql.sql`TRUE`}`;
    return this.db.$transaction(
      async (tx) => {
        const ids = await tx.$queryRaw<{ id: string }[]>(
            Sql.sql`SELECT id FROM pending_reasons ${where} ORDER BY name,id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
          ),
          [n] = await tx.$queryRaw<{ n: bigint }[]>(
            Sql.sql`SELECT count(*) AS n FROM pending_reasons ${where}`,
          );
        return {
          items: (
            await tx.pendingReason.findMany({
              where: { id: { in: ids.map((i) => i.id) } },
              orderBy: [{ name: 'asc' }, { id: 'asc' }],
            })
          ).map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          })),
          total: Number(n?.n ?? 0n),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  policies(page: number, pageSize: number) {
    return this.db.$transaction(
      async (tx) => ({
        items: (
          await tx.slaPolicyVersion.findMany({
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (page - 1) * pageSize,
            take: pageSize,
          })
        ).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
        total: await tx.slaPolicyVersion.count(),
        page,
        pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  adminWrite(
    identity: Identity,
    kind: 'reason' | 'policy',
    id: string | undefined,
    input: Record<string, unknown>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, identity, true);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026,600)`;
        let rid: string;
        if (kind === 'policy') {
          const priority = input.priority as 'LOW' | 'MEDIUM' | 'HIGH',
            last = await tx.slaPolicyVersion.findFirst({
              where: { priority },
              orderBy: { version: 'desc' },
            });
          rid = (
            await tx.slaPolicyVersion.create({
              data: {
                priority,
                version: (last?.version ?? 0) + 1,
                targetMinutes: input.targetMinutes as number,
              },
            })
          ).id;
        } else {
          if (id && !(await tx.pendingReason.findUnique({ where: { id } })))
            throw resourceNotFound();
          rid = id
            ? (await tx.pendingReason.update({ where: { id }, data: input })).id
            : (
                await tx.pendingReason.create({
                  data: input as { name: string },
                })
              ).id;
        }
        await tx.adminAuditEvent.create({
          data: {
            actorId: identity.user.id,
            resourceType: kind,
            resourceId: rid,
            action: id ? 'UPDATED' : 'CREATED',
            details: { fields: Object.keys(input) },
          },
        });
        return { id: rid };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
