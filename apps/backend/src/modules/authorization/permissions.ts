import { publicUserSchema } from '@helpdesk/contracts';
import type { UserRole } from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import { ApplicationError } from '../../shared/errors.js';

// Explicit grants only. ADMIN is not a wildcard and never inherits TECHNICIAN.
const grants = {
  'users.read': ['REQUESTER', 'TECHNICIAN', 'ADMIN'],
  'users.update-self': ['REQUESTER', 'TECHNICIAN'],
  'users.update-requester': ['ADMIN'],
  'technicians.create': ['ADMIN'],
  'technicians.read': ['ADMIN'],
  'technicians.update': ['ADMIN'],
  'services.create': ['ADMIN'],
  'services.read': ['REQUESTER', 'TECHNICIAN', 'ADMIN'],
  'categories.read': ['REQUESTER', 'TECHNICIAN', 'ADMIN'],
  'categories.create': ['ADMIN'],
  'categories.update': ['ADMIN'],
  'services.update': ['ADMIN'],
  'services.deactivate': ['ADMIN'],
  'tickets.create': ['REQUESTER'],
  'tickets.read': ['REQUESTER', 'TECHNICIAN', 'ADMIN'],
  'tickets.aggregate': ['REQUESTER', 'TECHNICIAN', 'ADMIN'],
  'tickets.triage': ['TECHNICIAN'],
  'tickets.classify': ['TECHNICIAN'],
  'tickets.start': ['TECHNICIAN'],
  'tickets.update-assigned': ['TECHNICIAN'],
} as const satisfies Record<string, readonly UserRole[]>;
export type Permission = keyof typeof grants;
export function forbidden() {
  return new ApplicationError('FORBIDDEN', 403, 'Operação não autorizada.');
}

export function requireIdentity(identity: Identity | undefined): Identity {
  if (!identity || !publicUserSchema.safeParse(identity.user).success)
    throw invalidSession();
  if (identity.user.mustChangePassword)
    throw new ApplicationError(
      'PASSWORD_CHANGE_REQUIRED',
      403,
      'Troque a senha inicial antes de acessar outras funcionalidades.',
    );
  return identity;
}
export function hasPermission(role: UserRole, permission: Permission) {
  const allowed: readonly UserRole[] | undefined = Object.hasOwn(
    grants,
    permission,
  )
    ? grants[permission]
    : undefined;
  return allowed?.includes(role) === true;
}
export function requirePermission(
  identity: Identity | undefined,
  permission: Permission,
) {
  const actor = requireIdentity(identity);
  if (!hasPermission(actor.user.role, permission)) throw forbidden();
  return actor;
}
export function resourceNotFound() {
  return new ApplicationError('NOT_FOUND', 404, 'Recurso não encontrado.');
}
