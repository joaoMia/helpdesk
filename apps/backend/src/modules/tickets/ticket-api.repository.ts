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
} from '@helpdesk/contracts';
import type { TicketUnit } from './ticket.repository.js';
import { prismaTicketUnit } from './prisma-ticket.repository.js';
import { ApplicationError } from '../../shared/errors.js';
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
  constructor(private db: PrismaClient) {}
  triage(identity: Identity, q: TriageQuery) {
    const where: Prisma.TicketWhereInput = {
      AND: [
        ticketScope(identity, 'tickets.triage'),
        q.queue === 'UNCLASSIFIED'
          ? { priority: null }
          : q.queue === 'CLASSIFIED'
            ? { priority: { not: null } }
            : {},
        q.priority ? { priority: q.priority } : {},
        q.search ? { code: Number(q.search.replace(/^HD-/i, '')) } : {},
      ],
    };
    return this.db.$transaction(
      async (tx) => ({
        items: await tx.ticket.findMany({
          where,
          select: triageSelect,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        total: await tx.ticket.count({ where }),
        page: q.page,
        pageSize: q.pageSize,
      }),
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
        const scope = ticketScope(identity, 'tickets.classify');
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
        const updated = await tx.ticket.updateMany({
          where: { AND: [scope, { id, priority: input.expectedPriority }] },
          data: {
            priority: input.priority,
            classifiedAt: new Date(),
            classifiedById: user.id,
          },
        });
        if (updated.count !== 1) throw triageConflict();
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
        return operation({
          ...unit,
          async findCatalog(id) {
            const entry = await unit.findCatalog(id);
            if (
              entry?.active &&
              entry.category.active &&
              entry.form?.fields.length
            )
              throw new ApplicationError(
                'FORM_NOT_SUPPORTED',
                409,
                'Este serviço exige um formulário personalizado ainda não disponível. Selecione outro serviço ou contate o suporte.',
              );
            return entry;
          },
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }
  list(identity: Identity, q: TicketQuery) {
    const numeric = /^(?:HD-)?([1-9]\d{0,8})$/i.exec(q.search),
      code = numeric ? Number(numeric[1]) : undefined;
    const where: Prisma.TicketWhereInput = {
      AND: [
        ticketScope(identity, 'tickets.read'),
        {
          ...(q.status ? { status: q.status } : {}),
          ...(q.priority
            ? { priority: q.priority === 'NONE' ? null : q.priority }
            : {}),
          ...(q.serviceId ? { serviceId: q.serviceId } : {}),
          ...(q.search
            ? {
                OR: [
                  { subject: { contains: q.search, mode: 'insensitive' } },
                  ...(code ? [{ code }] : []),
                  {
                    serviceSnapshot: {
                      path: ['serviceName'],
                      string_contains: q.search,
                    },
                  },
                ],
              }
            : {}),
        },
      ],
    };
    return this.db.$transaction(
      async (tx) => ({
        items: await tx.ticket.findMany({
          where,
          select: summarySelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (q.page - 1) * q.pageSize,
          take: q.pageSize,
        }),
        total: await tx.ticket.count({ where }),
        page: q.page,
        pageSize: q.pageSize,
      }),
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
