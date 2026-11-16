import { createHash } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  PrismaClient,
  Prisma as Types,
} from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { ProjectWorkflowRepository } from './project-workflow.repository.js';
import { resourceNotFound } from '../authorization/permissions.js';
import { ApplicationError } from '../../shared/errors.js';
import type { AttachmentStorage } from '../tickets/attachment-storage.js';

type Tx = Types.TransactionClient;
type FileRow = {
  id: string;
  project_id: string;
  owner_id: string;
  message_id: string | null;
  name: string;
  mime: string;
  size: number;
  sha256: string;
  storage_key: string;
  created_at: Date;
  expires_at: Date;
};
const terminal = (state: string) => ['COMPLETED', 'CANCELED'].includes(state);
const notWritable = () =>
  new ApplicationError(
    'PROJECT_CONFLICT',
    409,
    'A conversa está somente para leitura.',
  );
const conflict = (
  message = 'A conversa mudou. Atualize antes de tentar novamente.',
) => new ApplicationError('PROJECT_CONFLICT', 409, message);
const fileDto = (f: FileRow, uploaderName: string) => ({
  id: f.id,
  uploaderId: f.owner_id,
  uploaderName,
  name: f.name,
  mime: f.mime,
  size: f.size,
  createdAt: f.created_at.toISOString(),
  previewable: f.mime === 'image/png',
});

export class ProjectConversationRepository {
  constructor(readonly db: PrismaClient) {}

  private scope(i: Identity) {
    const active = Prisma.sql`NOT EXISTS (SELECT 1 FROM operational_retirements o WHERE o.project_id=r.id)`;
    return i.user.role === 'ADMIN'
      ? active
      : i.user.role === 'REQUESTER'
        ? Prisma.sql`${active} AND r.requester_id=${i.user.id}::uuid`
        : Prisma.sql`${active} AND w.owner_id=${i.user.id}::uuid`;
  }

  private async secure<T>(
    i: Identity,
    projectId: string,
    fn: (tx: Tx, state: string) => Promise<T>,
    write = false,
    allowTerminalReplay = false,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await new ProjectWorkflowRepository(this.db).actor(tx, i);
        const rows = write
          ? await tx.$queryRaw<{ state: string }[]>`
              SELECT COALESCE(w.state,'REQUESTED') state
              FROM project_requests r LEFT JOIN project_workflows w ON w.project_id=r.id
              WHERE r.id=${projectId}::uuid AND ${this.scope(i)} FOR UPDATE OF r`
          : await tx.$queryRaw<{ state: string }[]>`
              SELECT COALESCE(w.state,'REQUESTED') state
              FROM project_requests r LEFT JOIN project_workflows w ON w.project_id=r.id
              WHERE r.id=${projectId}::uuid AND ${this.scope(i)} FOR SHARE OF r`;
        if (!rows[0]) throw resourceNotFound();
        if (write && !allowTerminalReplay && terminal(rows[0].state))
          throw notWritable();
        return fn(tx, rows[0].state);
      },
      { isolationLevel: 'ReadCommitted', timeout: 15000 },
    );
  }

  async revision(i: Identity, projectId: string) {
    return this.secure(i, projectId, async (tx, state) => {
      const rows = await tx.$queryRaw<
        {
          total: number;
          last_at: Date | null;
          last_id: string | null;
          owner_id: string | null;
          revision: number;
        }[]
      >`SELECT count(m.id)::int total,max(m.created_at) last_at,(array_agg(m.id ORDER BY m.created_at DESC,m.id DESC))[1] last_id,w.owner_id,COALESCE(w.revision,1)::int revision
        FROM project_requests r LEFT JOIN project_workflows w ON w.project_id=r.id
        LEFT JOIN project_conversation_messages m ON m.project_id=r.id
        WHERE r.id=${projectId}::uuid AND ${this.scope(i)}
        GROUP BY w.owner_id,w.revision`;
      if (!rows[0]) throw resourceNotFound();
      return createHash('sha256')
        .update(JSON.stringify([rows[0], state]))
        .digest('hex');
    });
  }

  async read(i: Identity, projectId: string, page: number, pageSize: number) {
    return this.secure(i, projectId, async (tx) => {
      const messages = await tx.$queryRaw<
        {
          id: string;
          author_id: string;
          author_name: string;
          content: string;
          created_at: Date;
        }[]
      >`SELECT m.id,m.author_id,u.name author_name,m.content,m.created_at
        FROM project_conversation_messages m JOIN users u ON u.id=m.author_id
        WHERE m.project_id=${projectId}::uuid
        ORDER BY m.created_at ASC,m.id ASC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
      const count = await tx.$queryRaw<
        { total: number }[]
      >`SELECT count(*)::int total FROM project_conversation_messages WHERE project_id=${projectId}::uuid`;
      const files = messages.length
        ? await tx.$queryRaw<
            (FileRow & { uploader_name: string })[]
          >`SELECT f.*,u.name uploader_name FROM project_conversation_attachments f JOIN users u ON u.id=f.owner_id WHERE f.message_id IN (${Prisma.join(messages.map((m) => Prisma.sql`${m.id}::uuid`))}) ORDER BY f.created_at,f.id`
        : [];
      const attachments = new Map<string, ReturnType<typeof fileDto>[]>();
      for (const f of files) {
        const entry = attachments.get(f.message_id!) ?? [];
        entry.push(fileDto(f, f.uploader_name));
        attachments.set(f.message_id!, entry);
      }
      return {
        comments: messages.map((m) => ({
          id: m.id,
          authorId: m.author_id,
          authorName: m.author_name,
          content: m.content,
          createdAt: m.created_at.toISOString(),
          attachments: attachments.get(m.id) ?? [],
        })),
        total: count[0]!.total,
        page,
        pageSize,
        attachments: [],
        solution: null,
      };
    });
  }

  async send(
    i: Identity,
    projectId: string,
    input: {
      clientMessageId: string;
      content: string;
      attachmentIds: string[];
    },
  ) {
    return this.secure(
      i,
      projectId,
      async (tx, state) => {
        const existing = await tx.$queryRaw<{ id: string; content: string }[]>`
        SELECT id,content FROM project_conversation_messages
        WHERE project_id=${projectId}::uuid AND author_id=${i.user.id}::uuid AND client_message_id=${input.clientMessageId}::uuid`;
        if (existing[0]) {
          const oldFiles = await tx.$queryRaw<
            { id: string }[]
          >`SELECT id FROM project_conversation_attachments WHERE message_id=${existing[0].id}::uuid ORDER BY id`;
          if (
            existing[0].content !== input.content ||
            JSON.stringify(oldFiles.map((f) => f.id).sort()) !==
              JSON.stringify([...input.attachmentIds].sort())
          )
            throw conflict(
              'Identificador de mensagem reutilizado com outros dados.',
            );
          return { id: existing[0].id };
        }
        if (terminal(state)) throw notWritable();
        const now = new Date();
        const found = input.attachmentIds.length
          ? await tx.$queryRaw<
              FileRow[]
            >`SELECT * FROM project_conversation_attachments WHERE id IN (${Prisma.join(input.attachmentIds.map((id) => Prisma.sql`${id}::uuid`))}) AND project_id=${projectId}::uuid AND owner_id=${i.user.id}::uuid AND message_id IS NULL AND expires_at>CURRENT_TIMESTAMP FOR UPDATE`
          : [];
        if (found.length !== input.attachmentIds.length)
          throw conflict(
            'Um ou mais anexos não pertencem a esta conversa ou expiraram.',
          );
        const message = (
          await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO project_conversation_messages(project_id,author_id,client_message_id,content,created_at)
        VALUES(${projectId}::uuid,${i.user.id}::uuid,${input.clientMessageId}::uuid,${input.content},${now}) RETURNING id`
        )[0]!;
        for (const f of found) {
          await tx.$executeRaw`UPDATE project_conversation_attachments SET message_id=${message.id}::uuid,claimed_at=${now} WHERE id=${f.id}::uuid AND message_id IS NULL`;
          await this.fileEvent(tx, i, f.id, projectId, 'CLAIMED');
        }
        return { id: message.id };
      },
      true,
      true,
    );
  }

  async upload(
    i: Identity,
    projectId: string,
    file: {
      name: string;
      mime: string;
      size: number;
      sha256: string;
      storageKey: string;
    },
  ) {
    return this.secure(
      i,
      projectId,
      async (tx) => {
        const count = await tx.$queryRaw<
          { count: number }[]
        >`SELECT count(*)::int count FROM project_conversation_attachments WHERE owner_id=${i.user.id}::uuid AND message_id IS NULL AND expires_at>CURRENT_TIMESTAMP`;
        if (count[0]!.count >= 10)
          throw conflict('Remova um rascunho antes de anexar outro arquivo.');
        const now = new Date(),
          expires = new Date(now.getTime() + 86400000);
        const row = (
          await tx.$queryRaw<
            FileRow[]
          >`INSERT INTO project_conversation_attachments(project_id,owner_id,name,mime,size,sha256,storage_key,created_at,expires_at) VALUES(${projectId}::uuid,${i.user.id}::uuid,${file.name},${file.mime},${file.size},${file.sha256},${file.storageKey},${now},${expires}) RETURNING *`
        )[0]!;
        await this.fileEvent(tx, i, row.id, projectId, 'UPLOADED');
        return fileDto(row, i.user.name);
      },
      true,
    );
  }

  async discard(i: Identity, projectId: string, fileId: string) {
    const row = await this.secure(i, projectId, async (tx) => {
      const f = (
        await tx.$queryRaw<
          FileRow[]
        >`SELECT * FROM project_conversation_attachments WHERE id=${fileId}::uuid AND project_id=${projectId}::uuid AND owner_id=${i.user.id}::uuid AND message_id IS NULL FOR UPDATE`
      )[0];
      if (!f) throw resourceNotFound();
      await this.fileEvent(tx, i, f.id, projectId, 'DISCARDED');
      await tx.$executeRaw`DELETE FROM project_conversation_attachments WHERE id=${f.id}::uuid`;
      return f;
    });
    return row;
  }

  async download(
    i: Identity,
    projectId: string,
    fileId: string,
    storage: AttachmentStorage,
  ) {
    return this.secure(i, projectId, async (tx) => {
      const f = (
        await tx.$queryRaw<
          FileRow[]
        >`SELECT f.* FROM project_conversation_attachments f JOIN project_conversation_messages m ON m.id=f.message_id WHERE f.id=${fileId}::uuid AND f.project_id=${projectId}::uuid AND m.project_id=${projectId}::uuid`
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
      await this.fileEvent(tx, i, f.id, projectId, 'DOWNLOADED');
      return { file: f, bytes };
    });
  }

  async cleanExpired(storage: AttachmentStorage) {
    const expired = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        FileRow[]
      >`SELECT * FROM project_conversation_attachments WHERE message_id IS NULL AND expires_at<CURRENT_TIMESTAMP FOR UPDATE SKIP LOCKED`;
      for (const f of rows) {
        await this.fileEvent(tx, null, f.id, f.project_id, 'EXPIRED');
        await tx.$executeRaw`DELETE FROM project_conversation_attachments WHERE id=${f.id}::uuid`;
      }
      return rows;
    });
    for (const f of expired)
      await storage.removeOwn(f.storage_key).catch(() => {});
    const refs = await this.db.$queryRaw<
      { storage_key: string }[]
    >`SELECT storage_key FROM project_conversation_attachments UNION SELECT storage_key FROM project_attachments`;
    return {
      expired: expired.length,
      orphans: await storage.cleanOrphans(
        new Set(refs.map((f) => f.storage_key)),
      ),
    };
  }

  private async fileEvent(
    tx: Tx,
    i: Identity | null,
    id: string,
    projectId: string,
    kind: string,
  ) {
    await tx.$executeRaw`INSERT INTO project_conversation_attachment_events(file_id,project_id,actor_id,kind) VALUES(${id}::uuid,${projectId}::uuid,${i?.user.id ?? null}::uuid,${kind})`;
  }
}
