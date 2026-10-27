import {
  idSchema,
  ticketStatusSchema,
  ticketPrioritySchema,
} from '@helpdesk/contracts';
import { z } from 'zod';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { ApplicationError } from '../../shared/errors.js';
import { resourceNotFound } from './permissions.js';
import {
  ticketScope,
  ticketDetailSelect,
  triageSelect,
} from './ticket-scope.js';
import type { TicketOperation } from './ticket-scope.js';
import { userScope, userDetailSelect } from './user-scope.js';
import type { UserOperation } from './user-scope.js';

const filtersSchema = z.strictObject({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  serviceId: idSchema.optional(),
});
function filters(input: unknown): Prisma.TicketWhereInput {
  const parsed = filtersSchema.safeParse(input);
  if (!parsed.success)
    throw new ApplicationError('INVALID_INPUT', 400, 'Filtros inválidos.');
  return parsed.data;
}
function resourceId(input: unknown) {
  const id = idSchema.safeParse(input);
  if (!id.success) throw resourceNotFound();
  return id.data;
}

// Internal, scoped read/authorization adapter. No routes or business writes.
// Identity must come from auth middleware, never request body/query/headers.
export class AuthorizedResources {
  constructor(private readonly db: Pick<PrismaClient, 'ticket' | 'user'>) {}
  async ticket(identity: Identity, id: unknown) {
    const scope = ticketScope(identity, 'tickets.read');
    const row = await this.db.ticket.findFirst({
      where: { AND: [scope, { id: resourceId(id) }] },
      select: ticketDetailSelect,
    });
    if (!row) throw resourceNotFound();
    return row;
  }
  tickets(identity: Identity, input: unknown = {}) {
    return this.db.ticket.findMany({
      where: { AND: [ticketScope(identity, 'tickets.read'), filters(input)] },
      select: ticketDetailSelect,
      take: 50,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
  triage(identity: Identity, input: unknown = {}) {
    return this.db.ticket.findMany({
      where: { AND: [ticketScope(identity, 'tickets.triage'), filters(input)] },
      select: triageSelect,
      take: 50,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
  // Reusable aggregation primitive; no dashboard API or KPI is implemented.
  countsByStatus(identity: Identity, input: unknown = {}) {
    return this.db.ticket.groupBy({
      by: ['status'],
      where: {
        AND: [ticketScope(identity, 'tickets.aggregate'), filters(input)],
      },
      _count: { _all: true },
      orderBy: { status: 'asc' },
    });
  }
  async user(identity: Identity, id: unknown) {
    const scope = userScope(identity, 'users.read');
    const row = await this.db.user.findFirst({
      where: { AND: [scope, { id: resourceId(id) }] },
      select: userDetailSelect,
    });
    if (!row) throw resourceNotFound();
    return row;
  }
  async assertUserOperation(
    identity: Identity,
    id: unknown,
    operation: UserOperation,
  ) {
    const scope = userScope(identity, operation);
    const row = await this.db.user.findFirst({
      where: { AND: [scope, { id: resourceId(id) }] },
      select: { id: true },
    });
    if (!row) throw resourceNotFound();
  }
  async assertTicketOperation(
    identity: Identity,
    id: unknown,
    operation: TicketOperation,
  ) {
    const scope = ticketScope(identity, operation);
    const row = await this.db.ticket.findFirst({
      where: { AND: [scope, { id: resourceId(id) }] },
      select: { id: true },
    });
    if (!row) throw resourceNotFound();
    // Check only. Future changes must recheck the predicate inside their write
    // transaction; a successful preflight does not reserve/assign a ticket.
  }
}
