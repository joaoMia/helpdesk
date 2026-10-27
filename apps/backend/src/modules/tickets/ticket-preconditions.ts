import type { Prisma } from '../../generated/prisma/client.js';

// Eligibility predicates, not transitions. Future writes must put these in the
// same conditional UPDATE/transaction as assignment/event creation (RN-011).
export function classificationPrecondition(): Prisma.TicketWhereInput {
  return { status: 'OPEN', assignedTechnicianId: null };
}
export function startPrecondition(): Prisma.TicketWhereInput {
  return { ...classificationPrecondition(), priority: { not: null } };
}
export function modificationPrecondition(): Prisma.TicketWhereInput {
  return { status: { not: 'CLOSED' } };
}
