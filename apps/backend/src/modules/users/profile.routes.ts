import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthRuntime } from '../auth/auth.routes.js';
import { authorization } from '../authorization/http.js';
import { requirePermission } from '../authorization/permissions.js';
import { ApplicationError } from '../../shared/errors.js';
import { profileController } from './profile.controller.js';
import type { ProfileService } from './profile.service.js';
export function profileRoutes(auth: AuthRuntime, service: ProfileService) {
  const router = Router(),
    guard = authorization(auth),
    controller = profileController(service, auth);
  router.get('/me', ...guard.permission('users.read'), controller.get);
  router.patch(
    '/me',
    ...guard.roles('REQUESTER', 'TECHNICIAN'),
    (req, _res, next) => {
      requirePermission(req.identity, 'users.update-self');
      next();
    },
    rateLimit({
      windowMs: 15 * 60000,
      limit: 5,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(
          new ApplicationError(
            'TOO_MANY_ATTEMPTS',
            429,
            'Muitas tentativas. Aguarde antes de tentar novamente.',
          ),
        ),
    }),
    controller.patch,
  );
  return router;
}
