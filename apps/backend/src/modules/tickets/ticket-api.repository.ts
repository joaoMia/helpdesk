import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import {
  ticketScope,
  ticketDetailSelect,
} from '../authorization/ticket-scope.js';
import { resourceNotFound } from '../authorization/permissions.js';
import type { TicketQuery } from '@helpdesk/contracts';
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
