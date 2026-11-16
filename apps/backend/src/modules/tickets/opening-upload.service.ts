import { z } from 'zod';
import { idSchema } from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import { requirePermission } from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import {
  AttachmentStorage,
  validateAttachment,
  attachmentLimits,
} from './attachment-storage.js';
import type { OpeningUploadRepository } from './opening-upload.repository.js';
const query = z.strictObject({
  serviceId: idSchema,
  formVersionId: idSchema,
  fieldKey: z.string().min(1).max(100),
  name: z.string().min(1).max(240),
});
export class OpeningUploadService {
  readonly limits = attachmentLimits;
  constructor(
    private repo: OpeningUploadRepository,
    private storage = new AttachmentStorage(),
  ) {}
  async upload(identity: Identity, input: unknown, bytes: unknown) {
    requirePermission(identity, 'tickets.create');
    const q = query.safeParse(input);
    if (!q.success || !Buffer.isBuffer(bytes))
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Revise os dados do anexo.',
      );
    const file = await validateAttachment(q.data.name, bytes);
    const stored = await this.storage.put(file.bytes);
    try {
      const row = await this.repo.insert(
        identity,
        {
          serviceId: q.data.serviceId,
          formVersionId: q.data.formVersionId,
          fieldKey: q.data.fieldKey,
        },
        {
          name: file.name,
          mime: file.mime,
          size: file.bytes.length,
          sha256: stored.sha256,
          storageKey: stored.key,
        },
      );
      return {
        id: row.id,
        name: row.name,
        mime: row.mime,
        size: row.size,
        expiresAt: row.expiresAt.toISOString(),
      };
    } catch (e) {
      await this.storage.removeOwn(stored.key).catch(() => {
        /* Private orphan remains eligible for guarded maintenance. */
      });
      if (
        (e as { code?: string }).code === 'P2034' ||
        ['40001', '40P01'].includes(databaseErrorCode(e) ?? '')
      )
        throw new ApplicationError(
          'UPLOAD_CONFLICT',
          409,
          'Envio concorrente. Atualize os anexos antes de tentar novamente.',
        );
      throw e;
    }
  }
  async discard(identity: Identity, id: unknown) {
    requirePermission(identity, 'tickets.create');
    const parsed = idSchema.safeParse(id);
    if (!parsed.success)
      throw new ApplicationError('NOT_FOUND', 404, 'Recurso não encontrado.');
    const f = await this.repo.discard(identity, parsed.data);
    await this.storage.removeOwn(f.storageKey).catch(() => {
      /* Orphan reconciler will retry safely. */
    });
  }
}
