import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { ticketScope } from '../authorization/ticket-scope.js';

export class PersonalDashboardRepository {
  constructor(private db: PrismaClient) {}
  read(identity: Identity) {
    const scope = ticketScope(identity, 'tickets.aggregate');
    return this.db.$transaction(
      async (tx) => {
        const byStatus = await tx.ticket.groupBy({
          by: ['status'],
          where: scope,
          _count: true,
        });
        const byPriority = await tx.ticket.groupBy({
          by: ['priority'],
          where: scope,
          _count: true,
        });
        const recent = await tx.ticket.findMany({
          where: scope,
          take: 8,
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            code: true,
            subject: true,
            status: true,
            priority: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        const updates = await tx.ticketEvent.findMany({
          where: { ticket: scope },
          take: 8,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            id: true,
            ticketId: true,
            eventType: true,
            createdAt: true,
            ticket: { select: { code: true } },
          },
        });
        const slaScope = { ticket: scope, finishReason: 'SOLUTION' };
        return {
          total: byStatus.reduce((sum, row) => sum + row._count, 0),
          triageAvailable:
            identity.user.role === 'TECHNICIAN'
              ? await tx.ticket.count({
                  where: {
                    ...ticketScope(identity, 'tickets.triage'),
                    status: 'OPEN',
                    assignedTechnicianId: null,
                  },
                })
              : 0,
          byStatus: byStatus.map((row) => ({
            name: row.status,
            count: row._count,
          })),
          byPriority: byPriority.map((row) => ({
            name: row.priority ?? 'NONE',
            count: row._count,
          })),
          sla: {
            met: await tx.ticketSlaRevision.count({
              where: { ...slaScope, met: true },
            }),
            exceeded: await tx.ticketSlaRevision.count({
              where: { ...slaScope, met: false },
            }),
            unknown: await tx.ticketSlaRevision.count({
              where: { ...slaScope, met: null },
            }),
          },
          recent: recent.map((row) => ({
            ...row,
            code: Number(row.code),
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          })),
          updates: updates.map((row) => ({
            id: row.id,
            ticketId: row.ticketId,
            code: Number(row.ticket.code),
            eventType: row.eventType,
            createdAt: row.createdAt.toISOString(),
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
