import type { ErrorRequestHandler } from 'express';
import { publicError } from '../shared/errors.js';

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  const invalidJson =
    error instanceof SyntaxError && 'status' in error && error.status === 400;
  const tooLarge =
    !!error &&
    typeof error === 'object' &&
    'type' in error &&
    error.type === 'entity.too.large';
  const result = invalidJson
    ? { status: 400, code: 'INVALID_JSON', message: 'JSON inválido.' }
    : tooLarge
      ? {
          status: 413,
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Corpo da solicitação excede o limite permitido.',
        }
      : publicError(error);
  response.status(result.status).json({
    error: {
      code: result.code,
      message: result.message,
      requestId: response.locals.requestId,
    },
  });
};
