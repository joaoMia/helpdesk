import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthRuntime } from '../auth/auth.routes.js';
import { authorization } from '../authorization/http.js';
import type { CatalogService } from './catalog.service.js';
import type { CatalogKind } from './catalog.repository.js';
import { catalogController } from './catalog.controller.js';
import { ApplicationError } from '../../shared/errors.js';
export function catalogRoutes(
  kind: CatalogKind,
  auth: AuthRuntime,
  service: CatalogService,
) {
  const router = Router(),
    guard = authorization(auth),
    c = catalogController(kind, auth, service);
  const limit = rateLimit({
    windowMs: 15 * 60000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new ApplicationError(
          'TOO_MANY_ATTEMPTS',
          429,
          'Muitas alterações. Aguarde antes de tentar novamente.',
        ),
      ),
  });
  router.get(
    '/',
    ...guard.permission(
      kind === 'categories' ? 'categories.read' : 'services.read',
    ),
    c.list,
  );
  router.get(
    '/:id',
    ...guard.permission(
      kind === 'categories' ? 'categories.read' : 'services.read',
    ),
    c.detail,
  );
  router.post(
    '/',
    ...guard.permission(
      kind === 'categories' ? 'categories.create' : 'services.create',
    ),
    limit,
    c.create,
  );
  router.patch(
    '/:id',
    ...guard.permission(
      kind === 'categories' ? 'categories.update' : 'services.update',
    ),
    limit,
    c.update,
  );
  return router;
}
