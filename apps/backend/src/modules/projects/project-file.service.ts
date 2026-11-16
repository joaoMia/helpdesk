import { z } from 'zod';
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
import { ProjectFileRepository, fileMeta } from './project-file.repository.js';
const uploadInput = z.strictObject({
  categoryId: z.uuid(),
  versionId: z.uuid(),
  fieldKey: z.string().min(1).max(100),
  name: z.string().min(1).max(240),
});
function id(v: unknown) {
  const r = z.uuid().safeParse(v);
  if (!r.success) throw resourceNotFound();
  return r.data;
}
export class ProjectFileService {
  readonly limits = attachmentLimits;
  constructor(
    readonly repo: ProjectFileRepository,
    readonly storage = new AttachmentStorage(undefined, 'projects'),
  ) {}
  async upload(i: Identity, q: unknown, bytes: unknown) {
    requirePermission(i, 'projects.request');
    const v = uploadInput.safeParse(q);
    if (!v.success || !Buffer.isBuffer(bytes))
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Revise os dados do anexo.',
      );
    const file = await validateAttachment(v.data.name, bytes),
      stored = await this.storage.put(file.bytes);
    try {
      const f = await this.repo.upload(i, v.data, {
        name: file.name,
        mime: file.mime,
        size: file.bytes.length,
        storageKey: stored.key,
        sha256: stored.sha256,
      });
      return {
        id: f.id,
        name: f.name,
        mime: f.mime,
        size: f.size,
        expiresAt: f.expires_at.toISOString(),
      };
    } catch (e) {
      await this.storage.removeOwn(stored.key).catch(() => {});
      if (['40001', '40P01'].includes(databaseErrorCode(e) ?? ''))
        throw new ApplicationError(
          'UPLOAD_CONFLICT',
          409,
          'Envio concorrente. Consulte seus anexos antes de tentar novamente.',
        );
      throw e;
    }
  }
  async discard(i: Identity, fileId: unknown, q: unknown) {
    requirePermission(i, 'projects.request');
    this.empty(q);
    const f = await this.repo.discard(i, id(fileId));
    await this.storage.removeOwn(f.storage_key).catch(() => {});
  }
  async list(i: Identity, projectId: unknown, q: unknown) {
    requirePermission(i, 'projects.workflow-read');
    this.empty(q);
    return { items: await this.repo.list(i, id(projectId)) };
  }
  async download(i: Identity, projectId: unknown, fileId: unknown, q: unknown) {
    requirePermission(i, 'projects.workflow-read');
    const v = z
      .strictObject({ preview: z.literal('true').optional() })
      .safeParse(q);
    if (!v.success)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros não permitidos.',
      );
    const { file: f, bytes } = await this.repo.download(
      i,
      id(projectId),
      id(fileId),
      this.storage,
    );
    return {
      file: fileMeta(f),
      bytes,
      inline: v.data.preview === 'true' && f.mime === 'image/png',
    };
  }
  private empty(v: unknown) {
    if (!z.strictObject({}).safeParse(v).success)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros não permitidos.',
      );
  }
}
