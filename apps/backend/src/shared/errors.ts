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
const attachmentConstraints = [
  'comment_content_valid',
  'project_conversation_messages_content_check',
  'attachment_shape',
  'opening_upload_shape',
  'project_attachments_mime_check',
  'project_conversation_attachments_mime_check',
];

function outdatedAttachmentSchema(error: unknown) {
  if (databaseErrorCode(error) !== '23514') return false;
  const meta = object(object(error).meta);
  const cause = object(object(meta.driverAdapterError).cause);
  const detail = cause.originalMessage ?? meta.message ?? meta.database_error;
  return (
    typeof detail === 'string' &&
    attachmentConstraints.some((name) => detail.includes('"' + name + '"'))
  );
}

export function publicError(error: unknown) {
  if (error instanceof ApplicationError)
    return { status: error.status, code: error.code, message: error.message };
  if (outdatedAttachmentSchema(error))
    return {
      status: 503,
      code: 'ATTACHMENT_SCHEMA_OUTDATED',
      message:
        'O banco ainda precisa da atualização de anexos para este envio. Após a atualização, tente novamente.',
    };
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
