import type { ProjectService } from './modules/projects/project.service.js';
import { projectRoutes } from './modules/projects/project.routes.js';
import express from 'express';
import type { LifecycleService } from './modules/tickets/lifecycle.service.js';
import { lifecycleRoutes } from './modules/tickets/lifecycle.routes.js';
import type { ConversationService } from './modules/tickets/conversation.service.js';
import { conversationRoutes } from './modules/tickets/conversation.routes.js';
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
import type { AdministrationService } from './modules/administration/administration.service.js';
import { administrationRoutes } from './modules/administration/administration.routes.js';

export function createApp(
  auth?: AuthRuntime,
  profile?: ProfileService,
  technicians?: TechnicianService,
  catalog?: CatalogService,
  tickets?: TicketApiService,
  administration?: AdministrationService,
  conversation?: ConversationService,
  lifecycle?: LifecycleService,
  projects?: ProjectService,
) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.locals.requestId = randomUUID();
    response.setHeader('X-Request-Id', response.locals.requestId);
    next();
  });
  const normalJson = express.json({ limit: '16kb' }),
    formJson = express.json({ limit: '256kb' });
  app.use((req, res, next) => {
    const formDraft =
      req.method === 'PATCH' &&
      /^\/services\/[0-9a-f-]{36}\/form\/draft$/i.test(req.path);
    return (formDraft ? formJson : normalJson)(req, res, next);
  });

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', service: 'helpdesk-api' });
  });

  if (auth) app.use('/auth', auth.router);
  if (auth && projects) app.use('/projects', projectRoutes(auth, projects));
  if (auth && profile) app.use('/users', profileRoutes(auth, profile));
  if (auth && technicians)
    app.use('/technicians', technicianRoutes(auth, technicians));
  if (auth && catalog) {
    app.use('/categories', catalogRoutes('categories', auth, catalog));
    app.use('/services', catalogRoutes('services', auth, catalog));
  }
  if (auth && lifecycle) app.use(lifecycleRoutes(auth, lifecycle));
  if (auth && conversation)
    app.use('/tickets', conversationRoutes(auth, conversation));
  if (auth && tickets) app.use('/tickets', ticketRoutes(auth, tickets));
  if (auth && administration)
    app.use('/admin', administrationRoutes(auth, administration));

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
