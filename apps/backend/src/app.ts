import express from 'express';
import { randomUUID } from 'node:crypto';
import { errorHandler } from './middlewares/error-handler.js';

export function createApp() {
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
