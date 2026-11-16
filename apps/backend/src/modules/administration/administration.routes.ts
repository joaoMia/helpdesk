import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { ApplicationError } from '../../shared/errors.js';
import type { AuthRuntime } from '../auth/auth.routes.js';
import { authorization } from '../authorization/http.js';
import type { AdministrationService } from './administration.service.js';
import { administrationController } from './administration.controller.js';
export function administrationRoutes(
  auth: AuthRuntime,
  service: AdministrationService,
) {
  const r = Router(),
    guard = authorization(auth),
    c = administrationController(auth, service);
  r.use(...guard.permission('administration.manage'));
  const credentialLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.identity!.user.id,
    handler: (_req, _res, next) =>
      next(
        new ApplicationError(
          'TOO_MANY_ATTEMPTS',
          429,
          'Muitas operações de credenciais. Aguarde antes de tentar novamente.',
        ),
      ),
  });
  r.delete('/users/:id', c.removeUser);
  r.post('/retirements', c.retire);
  r.get('/users', c.users);
  r.post('/users', credentialLimit, c.createUser);
  r.get('/users/:id', c.user);
  r.patch('/users/:id', c.updateUser);
  r.post('/users/:id/reset-password', credentialLimit, c.resetPassword);
  r.get('/organization-default', c.defaults);
  r.patch('/organization-default', c.setDefault);
  r.get('/schedules/:id/versions', c.versions);
  for (const kind of ['companies', 'departments', 'schedules'] as const) {
    const h = c.entity(kind);
    r.get('/' + kind, h.list);
    r.post('/' + kind, h.save);
    r.get('/' + kind + '/:id', h.detail);
    r.patch('/' + kind + '/:id', h.save);
  }
  return r;
}
