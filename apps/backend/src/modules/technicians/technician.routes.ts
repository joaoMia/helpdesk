import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthRuntime } from '../auth/auth.routes.js';
import { authorization } from '../authorization/http.js';
import { ApplicationError } from '../../shared/errors.js';
import { technicianController } from './technician.controller.js';
import type { TechnicianService } from './technician.service.js';
export function technicianRoutes(
  auth: AuthRuntime,
  service: TechnicianService,
) {
  const router = Router(),
    guard = authorization(auth),
    c = technicianController(auth, service);
  const limit = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
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
  });
  router.get('/', ...guard.permission('technicians.read'), c.list);
  router.get('/:id', ...guard.permission('technicians.read'), c.detail);
  router.post('/', ...guard.permission('technicians.create'), limit, c.create);
  router.patch(
    '/:id',
    ...guard.permission('technicians.update'),
    limit,
    c.update,
  );
  return router;
}
