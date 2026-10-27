import type { RequestHandler } from 'express';
import type { UserRole } from '@helpdesk/contracts';
import type { AuthRuntime } from '../auth/auth.routes.js';
import { ApplicationError } from '../../shared/errors.js';
import { requireIdentity, requirePermission } from './permissions.js';
import type { Permission } from './permissions.js';

export function authorization(auth: AuthRuntime) {
  // Re-authenticate every request, even if an earlier middleware filled identity.
  // Reuse cookies, origin/CORS, CSRF, revocation and initial-password protections.
  const secured = (guard: RequestHandler): RequestHandler[] => [
    auth.http.origin,
    auth.http.corsPolicy,
    auth.http.protect,
    auth.http.authenticate(),
    guard,
  ];
  return {
    permission(permission: Permission) {
      return secured((req, _res, next) => {
        requirePermission(req.identity, permission);
        next();
      });
    },
    roles(...roles: UserRole[]) {
      return secured((req, _res, next) => {
        const identity = requireIdentity(req.identity);
        if (!roles.includes(identity.user.role))
          throw new ApplicationError(
            'FORBIDDEN',
            403,
            'Operação não autorizada.',
          );
        next();
      });
    },
  };
}
