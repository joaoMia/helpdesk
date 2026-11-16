import type {
  PrismaClient,
  Prisma as Types,
} from '../../generated/prisma/client.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { ProjectWorkflowRepository } from './project-workflow.repository.js';
import { forbidden, resourceNotFound } from '../authorization/permissions.js';
import { ApplicationError } from '../../shared/errors.js';
import { editableFormSchema } from '@helpdesk/contracts';
import type { AttachmentStorage } from '../tickets/attachment-storage.js';
type Tx = Types.TransactionClient;
export type ProjectFileRow = {
  id: string;
  owner_id: string;
  category_id: string;
  version_id: string;
  field_id: string;
  field_key: string;
  project_id: string | null;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  storage_key: string;
  created_at: Date;
  expires_at: Date;
};
export const fileMeta = (f: ProjectFileRow) => ({
  id: f.id,
  name: f.name,
  mime: f.mime,
  size: f.size,
  fieldKey: f.field_key,
  createdAt: f.created_at.toISOString(),
});
export class ProjectFileRepository {
  constructor(readonly db: PrismaClient) {}
  private async secure<T>(i: Identity, fn: (tx: Tx) => Promise<T>) {
    return this.db.$transaction(async (tx) => {
      await new ProjectWorkflowRepository(this.db).actor(tx, i);
      return fn(tx);
    });
  }
  async event(
    tx: Tx,
    i: Identity | null,
    f: { id: string; project_id: string | null },
    kind: string,
  ) {
    await tx.$executeRaw`INSERT INTO project_attachment_events(file_id,project_id,actor_id,kind) VALUES(${f.id}::uuid,${f.project_id}::uuid,${i?.user.id ?? null}::uuid,${kind})`;
  }
  async upload(
    i: Identity,
    input: { categoryId: string; versionId: string; fieldKey: string },
    file: {
      name: string;
      mime: string;
      size: number;
      sha256: string;
      storageKey: string;
    },
  ) {
    if (i.user.role !== 'REQUESTER') throw forbidden();
    return this.secure(i, async (tx) => {
      const v = (
        await tx.$queryRaw<
          { definition: unknown }[]
        >`SELECT v.definition FROM project_categories c JOIN project_category_versions v ON v.category_id=c.id WHERE c.id=${input.categoryId}::uuid AND c.is_active AND v.id=${input.versionId}::uuid AND v.version=(SELECT max(version) FROM project_category_versions WHERE category_id=c.id) FOR SHARE OF c`
      )[0];
      const field = v
        ? editableFormSchema
            .parse(v.definition)
            .fields.find((f) => f.key === input.fieldKey && f.type === 'FILE')
        : undefined;
      if (!field) throw resourceNotFound();
      const count = await tx.$queryRaw<
        { n: number }[]
      >`SELECT count(*)::int n FROM project_attachments WHERE owner_id=${i.user.id}::uuid AND project_id IS NULL AND expires_at>CURRENT_TIMESTAMP`;
      if (count[0]!.n >= 10)
        throw new ApplicationError(
          'UPLOAD_LIMIT',
          409,
          'Remova um anexo temporário antes de enviar outro. Limite de dez arquivos.',
        );
      const now = new Date(),
        expires = new Date(now.getTime() + 86400000);
      const f = (
        await tx.$queryRaw<
          ProjectFileRow[]
        >`INSERT INTO project_attachments(owner_id,category_id,version_id,field_id,field_key,name,mime,size,sha256,storage_key,created_at,expires_at) VALUES(${i.user.id}::uuid,${input.categoryId}::uuid,${input.versionId}::uuid,${field.id}::uuid,${field.key},${file.name},${file.mime},${file.size},${file.sha256},${file.storageKey},${now},${expires}) RETURNING *`
      )[0]!;
      await this.event(tx, i, f, 'UPLOADED');
      return f;
    });
  }
  async discard(i: Identity, id: string) {
    if (i.user.role !== 'REQUESTER') throw forbidden();
    return this.secure(i, async (tx) => {
      const f = (
        await tx.$queryRaw<
          ProjectFileRow[]
        >`SELECT * FROM project_attachments WHERE id=${id}::uuid AND owner_id=${i.user.id}::uuid AND project_id IS NULL FOR UPDATE`
      )[0];
      if (!f) throw resourceNotFound();
      await this.event(tx, i, f, 'DISCARDED');
      await tx.$executeRaw`DELETE FROM project_attachments WHERE id=${id}::uuid`;
      return f;
    });
  }
  private scope(i: Identity) {
    const active = Prisma.sql`NOT EXISTS (SELECT 1 FROM operational_retirements o WHERE o.project_id=r.id)`;
    return i.user.role === 'ADMIN'
      ? active
      : i.user.role === 'REQUESTER'
        ? Prisma.sql`${active} AND r.requester_id=${i.user.id}::uuid`
        : Prisma.sql`${active} AND w.owner_id=${i.user.id}::uuid`;
  }
  async list(i: Identity, projectId: string) {
    return this.secure(i, async (tx) => {
      const allowed =
        await tx.$queryRaw`SELECT r.id FROM project_requests r LEFT JOIN project_workflows w ON w.project_id=r.id WHERE r.id=${projectId}::uuid AND ${this.scope(i)}`;
      if (!(allowed as unknown[]).length) throw resourceNotFound();
      const rows = await tx.$queryRaw<
        (ProjectFileRow & { definition: unknown })[]
      >`SELECT f.*,v.definition FROM project_attachments f JOIN project_category_versions v ON v.id=f.version_id WHERE project_id=${projectId}::uuid ORDER BY f.created_at,f.id`;
      return rows.map((f) => ({
        ...fileMeta(f),
        fieldLabel:
          editableFormSchema
            .parse(f.definition)
            .fields.find((field) => field.id === f.field_id)?.label ??
          f.field_key,
      }));
    });
  }
  async download(
    i: Identity,
    projectId: string,
    fileId: string,
    storage: AttachmentStorage,
  ) {
    return this.secure(i, async (tx) => {
      const f = (
        await tx.$queryRaw<
          ProjectFileRow[]
        >`SELECT f.* FROM project_attachments f JOIN project_requests r ON r.id=f.project_id LEFT JOIN project_workflows w ON w.project_id=r.id WHERE f.id=${fileId}::uuid AND f.project_id=${projectId}::uuid AND ${this.scope(i)} FOR SHARE OF r`
      )[0];
      if (!f) throw resourceNotFound();
      let bytes: Buffer;
      try {
        bytes = await storage.get(f.storage_key, f.sha256);
      } catch {
        throw new ApplicationError(
          'FILE_UNAVAILABLE',
          503,
          'Arquivo temporariamente indisponível. Tente novamente.',
        );
      }
      await this.event(tx, i, f, 'DOWNLOADED');
      return { file: f, bytes };
    });
  }
  async claim(
    tx: Tx,
    i: Identity,
    projectId: string,
    categoryId: string,
    versionId: string,
    field: { id: string; key: string },
    ids: string[],
    storage: AttachmentStorage,
  ) {
    if (!ids.length || ids.length > 10 || new Set(ids).size !== ids.length)
      throw new ApplicationError(
        'INVALID_FILE',
        400,
        'Selecione anexos válidos e distintos.',
      );
    for (const id of ids) {
      const f = (
        await tx.$queryRaw<
          ProjectFileRow[]
        >`SELECT * FROM project_attachments WHERE id=${id}::uuid AND owner_id=${i.user.id}::uuid AND category_id=${categoryId}::uuid AND version_id=${versionId}::uuid AND field_id=${field.id}::uuid AND field_key=${field.key} AND project_id IS NULL AND expires_at>CURRENT_TIMESTAMP FOR UPDATE`
      )[0];
      if (!f)
        throw new ApplicationError(
          'INVALID_FILE',
          400,
          'Anexo expirado ou não vinculado ao usuário e formulário atuais.',
        );
      await storage.get(f.storage_key, f.sha256);
      await tx.$executeRaw`UPDATE project_attachments SET project_id=${projectId}::uuid,claimed_at=${new Date()} WHERE id=${id}::uuid AND project_id IS NULL`;
      await this.event(tx, i, { id, project_id: projectId }, 'CLAIMED');
    }
  }
  async cleanExpired(storage: AttachmentStorage) {
    const expired = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        ProjectFileRow[]
      >`SELECT * FROM project_attachments WHERE project_id IS NULL AND expires_at<CURRENT_TIMESTAMP FOR UPDATE SKIP LOCKED`;
      for (const f of rows) {
        await this.event(tx, null, f, 'EXPIRED');
        await tx.$executeRaw`DELETE FROM project_attachments WHERE id=${f.id}::uuid`;
      }
      return rows;
    });
    for (const f of expired)
      await storage.removeOwn(f.storage_key).catch(() => {});
    const referenced = await this.db.$queryRaw<
      { storage_key: string }[]
    >`SELECT storage_key FROM project_attachments UNION SELECT storage_key FROM project_conversation_attachments`;
    return {
      expired: expired.length,
      orphans: await storage.cleanOrphans(
        new Set(referenced.map((f) => f.storage_key)),
      ),
    };
  }
}
