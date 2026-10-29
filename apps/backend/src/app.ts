import express from 'express';
import { randomUUID } from 'node:crypto';
import { errorHandler } from './middlewares/error-handler.js';
import type { AuthRuntime } from './modules/auth/auth.routes.js';
import type { ProfileService } from './modules/users/profile.service.js';
import { profileRoutes } from './modules/users/profile.routes.js';
import type { TechnicianService } from './modules/technicians/technician.service.js';
import { technicianRoutes } from './modules/technicians/technician.routes.js';
import type { CatalogService } from './modules/catalog/catalog.service.js';
import { catalogRoutes } from './modules/catalog/catalog.routes.js';
import type { TicketApiService } from './modules/tickets/ticket-api.service.js';
import { ticketRoutes } from './modules/tickets/ticket.routes.js';

export function createApp(
  auth?: AuthRuntime,
  profile?: ProfileService,
  technicians?: TechnicianService,
  catalog?: CatalogService,
  tickets?: TicketApiService,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.locals.requestId = randomUUID();
    response.setHeader('X-Request-Id', response.locals.requestId);
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', service: 'helpdesk-api' });
  });

  if (auth) app.use('/auth', auth.router);
  if (auth && profile) app.use('/users', profileRoutes(auth, profile));
  if (auth && technicians)
    app.use('/technicians', technicianRoutes(auth, technicians));
  if (auth && catalog) {
    app.use('/categories', catalogRoutes('categories', auth, catalog));
    app.use('/services', catalogRoutes('services', auth, catalog));
  }
  if (auth && tickets) app.use('/tickets', ticketRoutes(auth, tickets));

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: 'Recurso não encontrado.',
        requestId: response.locals.requestId,
      },
    });
  });

  app.use(errorHandler);
  return app;
}
