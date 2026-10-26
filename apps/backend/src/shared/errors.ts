export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}
export function databaseErrorCode(error: unknown) {
  const meta = object(object(error).meta),
    cause = object(object(meta.driverAdapterError).cause);
  const code = meta.code ?? cause.originalCode;
  return typeof code === 'string' ? code : undefined;
}
export function publicError(error: unknown) {
  if (error instanceof ApplicationError)
    return { status: error.status, code: error.code, message: error.message };
  const code =
    error && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined;
  if (
    ['P2002', 'P2003', 'P2034'].includes(String(code)) ||
    ['23502', '23503', '23505', '23514'].includes(
      databaseErrorCode(error) ?? '',
    )
  )
    return {
      status: 409,
      code: 'DATA_CONFLICT',
      message: 'A operação conflita com o estado atual dos dados.',
    };
  if (code === 'P2025')
    return {
      status: 404,
      code: 'NOT_FOUND',
      message: 'Recurso não encontrado.',
    };
  if (['P1001', 'P1002', 'P1008', 'P1017', 'P2024'].includes(String(code)))
    return {
      status: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Persistência temporariamente indisponível.',
    };
  return {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Não foi possível processar a solicitação.',
  };
}
