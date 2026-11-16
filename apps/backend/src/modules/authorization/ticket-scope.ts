import type { Prisma } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { forbidden, requirePermission } from './permissions.js';
import {
  classificationPrecondition,
  modificationPrecondition,
  startPrecondition,
} from '../tickets/ticket-preconditions.js';

export type TicketOperation =
  | 'tickets.read'
  | 'tickets.aggregate'
  | 'tickets.triage'
  | 'tickets.classify'
  | 'tickets.start'
  | 'tickets.update-assigned';
export function ticketScope(
  identity: Identity,
  operation: TicketOperation,
): Prisma.TicketWhereInput {
  const actor = requirePermission(identity, operation).user;
  switch (operation) {
    case 'tickets.triage':
    case 'tickets.classify':
      return { ...classificationPrecondition(), retirement: { is: null } };
    case 'tickets.start':
      return { ...startPrecondition(), retirement: { is: null } };
    case 'tickets.update-assigned':
      return {
        AND: [{ assignedTechnicianId: actor.id }, modificationPrecondition()],
      };
    case 'tickets.read':
      switch (actor.role) {
        case 'REQUESTER':
          return { requesterId: actor.id, retirement: { is: null } };
        case 'TECHNICIAN':
          return { retirement: { is: null } };
        case 'ADMIN':
          return { retirement: { is: null } };
        default:
          throw forbidden();
      }
    case 'tickets.aggregate':
      switch (actor.role) {
        case 'REQUESTER':
          return { requesterId: actor.id, retirement: { is: null } };
        case 'TECHNICIAN':
          return { assignedTechnicianId: actor.id, retirement: { is: null } };
        case 'ADMIN':
          return { retirement: { is: null } };
        default:
          throw forbidden();
      }
    default:
      throw forbidden();
  }
}

// Conservative ADR-03 projection: no subject/description, snapshot, answers,
// attachments or requester/technician identities before assignment.
export const triageSelect = {
  id: true,
  code: true,
  status: true,
  priority: true,
  createdAt: true,
} as const satisfies Prisma.TicketSelect;
export const ticketDetailSelect = {
  ...triageSelect,
  subject: true,
  description: true,
  requesterId: true,
  requester: { select: { name: true } },
  assignedTechnician: { select: { name: true } },
  resolvedAt: true,
  serviceId: true,
  formVersionId: true,
  serviceSnapshot: true,
  assignedTechnicianId: true,
  classifiedAt: true,
  classifiedById: true,
  firstStartedAt: true,
  closedAt: true,
  closedById: true,
  updatedAt: true,
  answers: { select: { fieldKey: true, value: true, createdAt: true } },
  events: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      actorId: true,
      eventType: true,
      oldValue: true,
      newValue: true,
      createdAt: true,
    },
  },
} as const satisfies Prisma.TicketSelect;
