import type { Prisma } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { forbidden, requirePermission } from './permissions.js';

export type UserOperation =
  | 'users.read'
  | 'users.update-self'
  | 'users.update-requester'
  | 'technicians.update';
export function userScope(
  identity: Identity,
  operation: UserOperation,
): Prisma.UserWhereInput {
  const actor = requirePermission(identity, operation).user;
  switch (operation) {
    case 'users.read':
      return actor.role === 'ADMIN'
        ? {
            OR: [
              { id: actor.id },
              { role: { in: ['REQUESTER', 'TECHNICIAN'] } },
            ],
          }
        : { id: actor.id };
    case 'users.update-self':
      return { id: actor.id };
    case 'users.update-requester':
      return { role: 'REQUESTER' };
    case 'technicians.update':
      return { role: 'TECHNICIAN' };
    default:
      throw forbidden();
  }
}
export const userDetailSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.UserSelect;
