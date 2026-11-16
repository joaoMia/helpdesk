import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import {
  ticketScope,
  ticketDetailSelect,
  triageSelect,
} from '../authorization/ticket-scope.js';
import { resourceNotFound } from '../authorization/permissions.js';
import type {
  TicketQuery,
  TriageQuery,
  ClassifyPriority,
  OverviewQuery,
  AssigneeQuery,
  OperationalTicket,
  AssignTicketInput,
} from '@helpdesk/contracts';
import { requirePermission } from '../authorization/permissions.js';
import { containsText } from '../../shared/search.js';
import {
  applicableSchedule,
  switchCalendar,
} from '../calendars/calendar-segments.js';
import type { TicketUnit } from './ticket.repository.js';
import { prismaTicketUnit } from './prisma-ticket.repository.js';
import { ApplicationError } from '../../shared/errors.js';
import { classifySla, startSla } from '../calendars/sla-clock.js';
const summarySelect = {
  id: true,
  code: true,
  subject: true,
  status: true,
  priority: true,
  assignedTechnicianId: true,
  serviceId: true,
  serviceSnapshot: true,
  createdAt: true,
  updatedAt: true,
} as const;
export class TicketApiRepository {
  constructor(readonly db: PrismaClient) {}
  overview(identity: Identity, q: OverviewQuery & { id?: string }) {
    requirePermission(identity, 'tickets.overview');
    const where = Prisma.sql`WHERE ${q.id ? Prisma.sql`t.id=${q.id}::uuid` : Prisma.sql`TRUE`} AND NOT EXISTS(SELECT 1 FROM operational_retirements r0 WHERE r0.ticket_id=t.id) AND
      ${q.status ? Prisma.sql`t.status::text = ${q.status}` : Prisma.sql`TRUE`}
      AND ${q.priority ? (q.priority === 'NONE' ? Prisma.sql`t.priority IS NULL` : Prisma.sql`t.priority::text = ${q.priority}`) : Prisma.sql`TRUE`}
      AND ${q.search ? Prisma.sql`(${containsText(Prisma.sql`'HD-' || t.code::text`, q.search)} OR ${containsText(Prisma.sql`u.name`, q.search)} OR ${containsText(Prisma.sql`r.name`, q.search)} OR ${containsText(Prisma.sql`t.service_snapshot->>'serviceName'`, q.search)} OR ${containsText(Prisma.sql`t.organization_snapshot->>'companyName'`, q.search)})` : Prisma.sql`TRUE`}`;
    return this.db.$transaction(
      async (tx) => {
        const items = await tx.$queryRaw<
          (Omit<OperationalTicket, 'createdAt'> & { createdAt: Date })[]
        >(Prisma.sql`
        SELECT t.id, t.code, t.status, t.priority, t.created_at AS "createdAt", u.name AS "responsibleName", (t.assigned_technician_id=${identity.user.id}::uuid OR ${identity.user.role}::text='ADMIN') IS TRUE AS "canRetire", t.service_snapshot->>'categoryName' AS "categoryName", t.service_snapshot->>'serviceName' AS "serviceName", r.name AS "requesterName", t.organization_snapshot->>'companyName' AS "companyName", t.organization_snapshot->>'departmentName' AS "departmentName"
        FROM tickets t LEFT JOIN users u ON u.id=t.assigned_technician_id LEFT JOIN users r ON r.id=t.requester_id
        ${where} ORDER BY t.created_at DESC, t.id DESC
        LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`);
        const [count] = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`
        SELECT count(*) AS total FROM tickets t LEFT JOIN users u ON u.id=t.assigned_technician_id LEFT JOIN users r ON r.id=t.requester_id ${where}`);
        return {
          items,
          total: Number(count?.total ?? 0n),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  assignees(identity: Identity, q: AssigneeQuery) {
    requirePermission(identity, 'tickets.assignment-candidates');
    const where = Prisma.sql`WHERE role='TECHNICIAN' AND is_active=true AND must_change_password=false
      AND ${q.search ? containsText(Prisma.sql`name`, q.search) : Prisma.sql`TRUE`}`;
    return this.db.$transaction(
      async (tx) => {
        const items = await tx.$queryRaw<
          { id: string; name: string }[]
        >(Prisma.sql`
        SELECT id,name FROM users ${where} ORDER BY name,id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`);
        const [count] = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM users ${where}`,
        );
        return {
          items,
          total: Number(count?.total ?? 0n),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async triageDetail(identity: Identity, id: string) {
    const row = await this.db.ticket.findFirst({
      where: { AND: [ticketScope(identity, 'tickets.triage'), { id }] },
      select: {
        ...triageSelect,
        serviceSnapshot: true,
        organizationSnapshot: true,
        requester: { select: { name: true } },
      },
    });
    if (!row) throw resourceNotFound();
    return row;
  }
  assign(identity: Identity, id: string, input: AssignTicketInput) {
    requirePermission(identity, 'tickets.assign');
    return this.db.$transaction(
      async (tx) => {
        const ids = [...new Set([identity.user.id, input.technicianId])].sort();
        for (const uid of ids)
          await tx.$queryRaw`SELECT id FROM users WHERE id=${uid}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
        const actor = await tx.user.findUnique({
            where: { id: identity.user.id },
          }),
          session = await tx.authSession.findUnique({
            where: { id: identity.sessionId },
          });
        if (
          !actor ||
          !['ADMIN', 'TECHNICIAN'].includes(actor.role) ||
          !actor.isActive ||
          actor.mustChangePassword ||
          !session ||
          session.userId !== actor.id ||
          session.revokedAt ||
          session.expiresAt <= new Date()
        )
          throw invalidSession();
        const recipient = await tx.user.findFirst({
          where: {
            id: input.technicianId,
            role: 'TECHNICIAN',
            isActive: true,
            mustChangePassword: false,
          },
          select: { id: true, name: true },
        });
        if (!recipient)
          throw new ApplicationError(
            'INVALID_RECIPIENT',
            409,
            'O técnico selecionado não está disponível. Atualize a lista.',
          );
        const result = await tx.ticket.updateMany({
          where: {
            id,
            retirement: { is: null },
            status: 'OPEN',
            priority: input.expectedPriority,
            assignedTechnicianId: null,
            firstStartedAt: null,
          },
          data: { assignedTechnicianId: recipient.id },
        });
        if (result.count !== 1) throw startConflict();
        await tx.ticketEvent.create({
          data: {
            ticketId: id,
            actorId: actor.id,
            eventType: 'ASSIGNED',
            oldValue: { assignedTechnicianId: null },
            newValue: {
              assignedTechnicianId: recipient.id,
              assignedTechnicianName: recipient.name,
              actorName: actor.name,
            },
          },
        });
        return tx.ticket.findUniqueOrThrow({
          where: { id },
          select: {
            id: true,
            code: true,
            status: true,
            priority: true,
            assignedTechnicianId: true,
            firstStartedAt: true,
          },
        });
      },
      { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 },
    );
  }
  start(identity: Identity, id: string) {
    return this.db.$transaction(
      async (tx) => {
        // Match the existing mutation lock order; revocation/initial-password
        // changes cannot race the identity check and leave an authorized write.
        await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: identity.user.id },
          select: {
            id: true,
            role: true,
            isActive: true,
            mustChangePassword: true,
          },
        });
        const session = await tx.authSession.findUnique({
          where: { id: identity.sessionId },
          select: { userId: true, revokedAt: true, expiresAt: true },
        });
        const now = new Date();
        if (
          !user ||
          user.role !== 'TECHNICIAN' ||
          !user.isActive ||
          user.mustChangePassword ||
          !session ||
          session.userId !== user.id ||
          session.revokedAt ||
          session.expiresAt <= now
        )
          throw invalidSession();
        // ticketScope delegates to startPrecondition: OPEN, classified and free.
        // Eligibility is part of the UPDATE itself, not just a preflight read.
        const beforeStart = await tx.ticket.findUnique({
          where: { id },
          select: {
            assignedTechnicianId: true,
            priority: true,
            firstStartedAt: true,
          },
        });
        const updated = await tx.ticket.updateMany({
          where: {
            id,
            retirement: { is: null },
            status: 'OPEN',
            priority: { not: null },
            firstStartedAt: null,
            OR: [
              { assignedTechnicianId: null },
              { assignedTechnicianId: user.id },
            ],
          },
          data: {
            status: 'IN_PROGRESS',
            assignedTechnicianId: user.id,
            firstStartedAt: now,
          },
        });
        if (updated.count !== 1) throw startConflict();
        const calendar = await applicableSchedule(tx, user.id, true);
        await switchCalendar(tx, id, calendar?.id ?? null, now);
        const slaPolicyVersionId = await startSla(
          tx,
          id,
          beforeStart!.priority!,
          now,
        );
        await tx.ticketEvent.create({
          data: {
            ticketId: id,
            actorId: user.id,
            eventType: 'ATTENDANCE_STARTED',
            createdAt: now,
            oldValue: {
              status: 'OPEN',
              assignedTechnicianId: beforeStart?.assignedTechnicianId ?? null,
              firstStartedAt:
                beforeStart?.firstStartedAt?.toISOString() ?? null,
            },
            newValue: {
              status: 'IN_PROGRESS',
              assignedTechnicianId: user.id,
              firstStartedAt: (
                beforeStart?.firstStartedAt ?? now
              ).toISOString(),
              slaPolicyVersionId,
            },
          },
        });
        return tx.ticket.findFirstOrThrow({
          where: { AND: [ticketScope(identity, 'tickets.read'), { id }] },
          select: {
            id: true,
            code: true,
            status: true,
            priority: true,
            assignedTechnicianId: true,
            firstStartedAt: true,
          },
        });
      },
      { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 },
    );
  }
  triage(identity: Identity, q: TriageQuery) {
    ticketScope(identity, 'tickets.triage');
    const where = Prisma.sql`WHERE status='OPEN' AND assigned_technician_id IS NULL AND NOT EXISTS(SELECT 1 FROM operational_retirements r0 WHERE r0.ticket_id=tickets.id)
      AND ${q.queue === 'UNCLASSIFIED' ? Prisma.sql`priority IS NULL` : q.queue === 'CLASSIFIED' ? Prisma.sql`priority IS NOT NULL` : Prisma.sql`TRUE`}
      AND ${q.priority ? Prisma.sql`priority::text=${q.priority}` : Prisma.sql`TRUE`}
      AND ${q.search ? containsText(Prisma.sql`'HD-' || code::text`, q.search) : Prisma.sql`TRUE`}`;
    return this.db.$transaction(
      async (tx) => {
        const items = await tx.$queryRaw<
          {
            id: string;
            code: number;
            status: 'OPEN';
            priority: 'LOW' | 'MEDIUM' | 'HIGH' | null;
            createdAt: Date;
          }[]
        >(
          Prisma.sql`SELECT id,code,status,priority,created_at AS "createdAt", service_snapshot->>'categoryName' AS "categoryName", service_snapshot->>'serviceName' AS "serviceName", (SELECT name FROM users WHERE users.id=tickets.requester_id) AS "requesterName", organization_snapshot->>'companyName' AS "companyName", organization_snapshot->>'departmentName' AS "departmentName" FROM tickets ${where} ORDER BY created_at,id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
        );
        const [count] = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM tickets ${where}`,
        );
        return {
          items,
          total: Number(count?.total ?? 0n),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  classify(identity: Identity, id: string, input: ClassifyPriority) {
    return this.db.$transaction(
      async (tx) => {
        // Same lock order as authentication/password changes: user, session, ticket.
        await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: identity.user.id },
          select: {
            id: true,
            role: true,
            isActive: true,
            mustChangePassword: true,
          },
        });
        const session = await tx.authSession.findUnique({
          where: { id: identity.sessionId },
          select: { userId: true, revokedAt: true, expiresAt: true },
        });
        if (
          !user ||
          user.role !== 'TECHNICIAN' ||
          !user.isActive ||
          user.mustChangePassword ||
          !session ||
          session.userId !== user.id ||
          session.revokedAt ||
          session.expiresAt <= new Date()
        )
          throw invalidSession();
        const scope: Prisma.TicketWhereInput = {
          retirement: { is: null },
          OR: [
            ticketScope(identity, 'tickets.classify'),
            {
              assignedTechnicianId: user.id,
              status: { in: ['OPEN', 'IN_PROGRESS', 'PENDING'] },
            },
          ],
        };
        const existing = await tx.ticket.findFirst({
          where: { AND: [scope, { id }] },
          select: triageSelect,
        });
        if (!existing) {
          // Both missing and ineligible resources have the same safe conflict.
          throw triageConflict();
        }
        if (existing.priority !== input.expectedPriority)
          throw triageConflict();
        if (existing.priority === input.priority) return existing;
        const now = new Date();
        const updated = await tx.ticket.updateMany({
          where: { AND: [scope, { id, priority: input.expectedPriority }] },
          data: {
            priority: input.priority,
            classifiedAt: now,
            classifiedById: user.id,
          },
        });
        if (updated.count !== 1) throw triageConflict();
        await classifySla(tx, id, input.priority, now);
        await tx.ticketEvent.create({
          data: {
            ticketId: id,
            actorId: user.id,
            eventType: 'PRIORITY_CLASSIFIED',
            oldValue: { priority: existing.priority },
            newValue: { priority: input.priority },
          },
        });
        return tx.ticket.findFirstOrThrow({
          where: { AND: [scope, { id }] },
          select: triageSelect,
        });
      },
      { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 },
    );
  }
  openingTransaction<T>(
    identity: Identity,
    operation: (unit: TicketUnit) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({
            where: { id: identity.user.id },
          }),
          session = await tx.authSession.findUnique({
            where: { id: identity.sessionId },
          });
        if (
          !user ||
          user.role !== 'REQUESTER' ||
          !user.isActive ||
          user.mustChangePassword ||
          !session ||
          session.userId !== user.id ||
          session.revokedAt ||
          session.expiresAt <= new Date()
        )
          throw invalidSession();
        const unit = prismaTicketUnit(tx);
        return operation(unit);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }
  list(identity: Identity, q: TicketQuery) {
    const ownership = ticketScope(identity, 'tickets.read');
    const scope =
      identity.user.role === 'REQUESTER'
        ? Prisma.sql`t.requester_id=${identity.user.id}::uuid`
        : Prisma.sql`TRUE`;
    const where = Prisma.sql`WHERE NOT EXISTS(SELECT 1 FROM operational_retirements r0 WHERE r0.ticket_id=t.id) AND ${scope}
      AND ${q.status ? Prisma.sql`t.status::text=${q.status}` : Prisma.sql`TRUE`}
      AND ${q.priority ? (q.priority === 'NONE' ? Prisma.sql`t.priority IS NULL` : Prisma.sql`t.priority::text=${q.priority}`) : Prisma.sql`TRUE`}
      AND ${q.serviceId ? Prisma.sql`t.service_id=${q.serviceId}::uuid` : Prisma.sql`TRUE`}
      AND ${q.search ? Prisma.sql`(${containsText(Prisma.sql`t.subject`, q.search)} OR ${containsText(Prisma.sql`'HD-' || t.code::text`, q.search)} OR ${containsText(Prisma.sql`t.service_snapshot->>'serviceName'`, q.search)})` : Prisma.sql`TRUE`}`;
    return this.db.$transaction(
      async (tx) => {
        const ids = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT t.id FROM tickets t ${where} ORDER BY t.created_at DESC,t.id DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
        );
        const [count] = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM tickets t ${where}`,
        );
        return {
          items: await tx.ticket.findMany({
            where: {
              AND: [ownership, { id: { in: ids.map((row) => row.id) } }],
            },
            select: summarySelect,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          }),
          total: Number(count?.total ?? 0n),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detail(identity: Identity, id: string) {
    const row = await this.db.ticket.findFirst({
      where: { AND: [ticketScope(identity, 'tickets.read'), { id }] },
      select: { ...ticketDetailSelect, events: false },
    });
    if (!row) throw resourceNotFound();
    return row;
  }
  history(
    identity: Identity,
    id: string,
    q: { page: number; pageSize: number },
  ) {
    return this.db.$transaction(
      async (tx) => {
        const where = { AND: [ticketScope(identity, 'tickets.read'), { id }] };
        if (!(await tx.ticket.findFirst({ where, select: { id: true } })))
          throw resourceNotFound();
        const eventWhere = {
          ticketId: id,
          ticket: ticketScope(identity, 'tickets.read'),
        };
        return {
          items: await tx.ticketEvent.findMany({
            where: eventWhere,
            select: {
              id: true,
              actorId: true,
              actor: { select: { name: true } },
              newValue: true,
              eventType: true,
              createdAt: true,
            },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
            skip: (q.page - 1) * q.pageSize,
            take: q.pageSize,
          }),
          total: await tx.ticketEvent.count({ where: eventWhere }),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
export function triageConflict() {
  return new ApplicationError(
    'TICKET_CONFLICT',
    409,
    'O chamado não está mais disponível para esta classificação ou a prioridade mudou. Atualize a fila antes de tentar novamente.',
  );
}
export function startConflict() {
  return new ApplicationError(
    'TICKET_CONFLICT',
    409,
    'O chamado não está mais disponível para assunção. Atualize a fila: ele precisa estar aberto, classificado e sem responsável.',
  );
}
