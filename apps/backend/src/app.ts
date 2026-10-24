import express from 'express';
import type { ErrorRequestHandler } from 'express';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_request, response) => {
    response.json({ status: 'ok', service: 'helpdesk-api' });
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' },
    });
  });

  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    _next,
  ) => {
    const invalidJson =
      error instanceof SyntaxError && 'status' in error && error.status === 400;
    response.status(invalidJson ? 400 : 500).json({
      error: {
        code: invalidJson ? 'INVALID_JSON' : 'INTERNAL_ERROR',
        message: invalidJson
          ? 'JSON inválido.'
          : 'Não foi possível processar a solicitação.',
      },
    });
  };
  app.use(errorHandler);
  return app;
}
