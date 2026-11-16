import { z } from 'zod';
import {
  conversationQuerySchema,
  conversationSchema,
  projectMessageInputSchema,
  attachmentNameSchema,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import {
  requirePermission,
  resourceNotFound,
} from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import {
  AttachmentStorage,
  attachmentLimits,
  validateAttachment,
} from '../tickets/attachment-storage.js';
import { ProjectConversationRepository } from './project-conversation.repository.js';

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError(
      'INVALID_INPUT',
      400,
      'Revise os campos da conversa.',
    );
  return result.data;
}
function uuid(input: unknown) {
  const parsed = z.uuid().safeParse(input);
  if (!parsed.success) throw resourceNotFound();
  return parsed.data;
}
export class ProjectConversationService {
  constructor(
    readonly repo: ProjectConversationRepository,
    readonly storage = new AttachmentStorage(undefined, 'projects'),
    readonly limits = attachmentLimits,
  ) {}
  private async mutate<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (e) {
      if (
        (e as { code?: string }).code === 'P2034' ||
        ['40001', '40P01', '23505'].includes(databaseErrorCode(e) ?? '')
      )
        throw new ApplicationError(
          'PROJECT_CONFLICT',
          409,
          'Outra operação alterou o projeto. Atualize a conversa e tente novamente.',
        );
      throw e;
    }
  }
  async revision(i: Identity, projectId: unknown) {
    requirePermission(i, 'projects.conversation');
    return this.repo.revision(i, uuid(projectId));
  }
  async read(i: Identity, projectId: unknown, query: unknown) {
    requirePermission(i, 'projects.conversation');
    const q = parse(conversationQuerySchema, query);
    return conversationSchema.parse(
      await this.repo.read(i, uuid(projectId), q.page, q.pageSize),
    );
  }
  async send(i: Identity, projectId: unknown, input: unknown) {
    requirePermission(i, 'projects.conversation');
    const v = parse(projectMessageInputSchema, input);
    return this.mutate(() => this.repo.send(i, uuid(projectId), v));
  }
  async upload(i: Identity, projectId: unknown, name: unknown, bytes: unknown) {
    requirePermission(i, 'projects.conversation');
    const parsed = attachmentNameSchema.safeParse(name);
    if (!parsed.success || !Buffer.isBuffer(bytes))
      throw new ApplicationError(
        'INVALID_FILE',
        400,
        'Envie um arquivo binário válido.',
      );
    const safe = await validateAttachment(
        parsed.data,
        bytes,
        this.limits.bytes,
      ),
      stored = await this.storage.put(safe.bytes);
    try {
      return await this.mutate(() =>
        this.repo.upload(i, uuid(projectId), {
          name: safe.name,
          mime: safe.mime,
          size: safe.bytes.length,
          sha256: stored.sha256,
          storageKey: stored.key,
        }),
      );
    } catch (e) {
      await this.storage.removeOwn(stored.key).catch(() => {});
      throw e;
    }
  }
  async discard(
    i: Identity,
    projectId: unknown,
    fileId: unknown,
    query: unknown,
  ) {
    requirePermission(i, 'projects.conversation');
    if (!z.strictObject({}).safeParse(query).success)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros não permitidos.',
      );
    const f = await this.repo.discard(i, uuid(projectId), uuid(fileId));
    await this.storage.removeOwn(f.storage_key).catch(() => {});
  }
  async download(
    i: Identity,
    projectId: unknown,
    fileId: unknown,
    query: unknown,
  ) {
    requirePermission(i, 'projects.conversation');
    const q = z
      .strictObject({ preview: z.literal('true').optional() })
      .safeParse(query);
    if (!q.success)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros não permitidos.',
      );
    const { file, bytes } = await this.repo.download(
      i,
      uuid(projectId),
      uuid(fileId),
      this.storage,
    );
    return {
      file,
      bytes,
      inline: q.data.preview === 'true' && file.mime === 'image/png',
    };
  }
}
