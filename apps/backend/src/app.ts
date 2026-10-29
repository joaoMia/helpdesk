import express from 'express';
import { randomUUID } from 'node:crypto';
import { errorHandler } from './middlewares/error-handler.js';
import type { AuthRuntime } from './modules/auth/auth.routes.js';
import type { ProfileService } from './modules/users/profile.service.js';
import { profileRoutes } from './modules/users/profile.routes.js';

export function createApp(auth?: AuthRuntime, profile?: ProfileService) {
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
