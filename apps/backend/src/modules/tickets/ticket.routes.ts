import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthRuntime } from '../auth/auth.routes.js';
import { authorization } from '../authorization/http.js';
import type { TicketApiService } from './ticket-api.service.js';
import { ticketController } from './ticket.controller.js';
import { ApplicationError } from '../../shared/errors.js';
import { openingUploadRoutes } from './opening-upload.routes.js';
export function ticketRoutes(auth: AuthRuntime, service: TicketApiService) {
  const r = Router(),
    guard = authorization(auth),
    c = ticketController(auth, service);
  r.use(openingUploadRoutes(auth, service.uploads));
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
          'Muitas tentativas de abertura. Aguarde antes de tentar novamente.',
        ),
      ),
  });
  r.get('/', ...guard.permission('tickets.read'), c.list);
  r.get('/triage', ...guard.permission('tickets.triage'), c.triage);
  r.get('/overview', ...guard.permission('tickets.overview'), c.overview);
  r.get(
    '/assignees',
    ...guard.permission('tickets.assignment-candidates'),
    c.assignees,
  );
  r.patch('/:id/priority', ...guard.permission('tickets.classify'), c.classify);
  r.post('/:id/assign', ...guard.permission('tickets.assign'), c.assign);
  r.get(
    '/:id/operational',
    ...guard.permission('tickets.overview'),
    c.operational,
  );
  r.get('/:id/triage', ...guard.permission('tickets.triage'), c.triageDetail);
  r.post('/:id/retirement', ...guard.permission('tickets.retire'), c.retire);
  r.post('/:id/start', ...guard.permission('tickets.start'), c.start);
  r.get('/:id/history', ...guard.permission('tickets.read'), c.history);
  r.get('/:id', ...guard.permission('tickets.read'), c.detail);
  r.post('/', ...guard.permission('tickets.create'), limit, c.create);
  return r;
}
