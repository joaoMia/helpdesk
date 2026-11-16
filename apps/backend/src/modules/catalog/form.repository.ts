import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import { Prisma as Sql } from '../../generated/prisma/client.js';
import { editableFormSchema } from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import { resourceNotFound } from '../authorization/permissions.js';
import { ApplicationError } from '../../shared/errors.js';
const conflict = () =>
  new ApplicationError(
    'FORM_CONFLICT',
    409,
    'O rascunho mudou. Recarregue antes de salvar ou publicar.',
  );
export class FormRepository {
  constructor(private db: PrismaClient) {}
  async read(identity: Identity, id: string, version?: number) {
    return this.db.$transaction(
      async (tx) => {
        const service = await tx.service.findFirst({
          where: {
            id,
            retirement: { is: null },
            category: { retirement: { is: null } },
            ...(identity.user.role === 'ADMIN'
              ? {}
              : {
                  isActive: true,
                  category: { isActive: true, retirement: { is: null } },
                }),
          },
          select: { id: true },
        });
        if (!service) throw resourceNotFound();
        const form = await tx.serviceFormVersion.findFirst({
          where: { serviceId: id, ...(version ? { version } : {}) },
          orderBy: { version: 'desc' },
          include: {
            fields: { orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] },
          },
        });
        const published = form
          ? {
              id: form.id,
              version: form.version,
              createdAt: form.createdAt.toISOString(),
              ...editableFormSchema.parse({
                title: form.title,
                description: form.description,
                fields: form.fields.map((f) => ({
                  id: f.id,
                  key: f.key,
                  label: f.label,
                  help: f.help,
                  description: f.description,
                  type: f.type,
                  required: f.required,
                  ...(f.options !== null ? { options: f.options } : {}),
                  ...(f.condition !== null ? { condition: f.condition } : {}),
                })),
              }),
            }
          : null;
        if (identity.user.role !== 'ADMIN') return { published };
        const draft = await tx.serviceFormDraft.findUnique({
          where: { serviceId: id },
        });
        const versions = await tx.serviceFormVersion.findMany({
          where: { serviceId: id },
          orderBy: { version: 'desc' },
          select: { id: true, version: true, title: true, createdAt: true },
        });
        return {
          published,
          draft: draft
            ? {
                revision: draft.revision,
                published: draft.publishedRevision === draft.revision,
                definition: editableFormSchema.parse(draft.definition),
              }
            : null,
          versions: versions.map((v) => ({
            ...v,
            createdAt: v.createdAt.toISOString(),
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async write(
    identity: Identity,
    id: string,
    revision: number,
    definition: Prisma.InputJsonValue | undefined,
    publish = false,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
        const u = await tx.user.findUnique({ where: { id: identity.user.id } }),
          s = await tx.authSession.findUnique({
            where: { id: identity.sessionId },
          });
        if (
          !u ||
          u.role !== 'ADMIN' ||
          !u.isActive ||
          u.mustChangePassword ||
          !s ||
          s.revokedAt ||
          s.expiresAt <= new Date() ||
          s.userId !== u.id
        )
          throw invalidSession();
        await tx.$queryRaw`SELECT id FROM services WHERE id=${id}::uuid FOR UPDATE`;
        if (
          !(await tx.service.findFirst({
            where: {
              id,
              retirement: { is: null },
              category: { retirement: { is: null } },
            },
          }))
        )
          throw resourceNotFound();
        const current = await tx.serviceFormDraft.findUnique({
          where: { serviceId: id },
        });
        if ((current?.revision ?? 0) !== revision) throw conflict();
        if (!publish) {
          if (!definition) throw conflict();
          const row = current
            ? await tx.serviceFormDraft.update({
                where: { serviceId: id },
                data: { definition, revision: { increment: 1 } },
              })
            : await tx.serviceFormDraft.create({
                data: { serviceId: id, definition },
              });
          return { revision: row.revision };
        }
        if (!current || current.publishedRevision === current.revision)
          throw conflict();
        const d = editableFormSchema.parse(current.definition),
          last = await tx.serviceFormVersion.findFirst({
            where: { serviceId: id },
            orderBy: { version: 'desc' },
          });
        const singleSystem = await tx.adminAuditEvent.findFirst({
          where: {
            resourceType: 'service',
            resourceId: id,
            action: 'CATALOG_REFERENCE_V1',
            details: { path: ['referenceKey'], equals: 's1' },
          },
          select: { id: true },
        });
        if (
          singleSystem &&
          !d.fields.some(
            (f) => f.key === 'systems' && f.type === 'SELECT' && f.required,
          )
        )
          throw new ApplicationError(
            'INVALID_FORM',
            400,
            'Criação de usuário exige o campo systems como seleção única obrigatória de sistema.',
          );
        const form = await tx.serviceFormVersion.create({
          data: {
            serviceId: id,
            version: (last?.version ?? 0) + 1,
            title: d.title,
            description: d.description,
            fields: {
              create: d.fields.map((f, index) => ({
                id: randomUUID(),
                key: f.key,
                label: f.label,
                type: f.type,
                required: f.required,
                help: f.help ?? '',
                description: f.description ?? '',
                displayOrder: index,
                options: f.options ?? Sql.DbNull,
                condition: f.condition ?? Sql.DbNull,
              })),
            },
          },
        });
        await tx.serviceFormDraft.update({
          where: { serviceId: id },
          data: { publishedRevision: current.revision },
        });
        await tx.adminAuditEvent.create({
          data: {
            actorId: u.id,
            resourceType: 'service',
            resourceId: id,
            action: 'FORM_PUBLISHED',
            details: { formVersionId: form.id, version: form.version },
          },
        });
        return { id: form.id, version: form.version };
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }
}
