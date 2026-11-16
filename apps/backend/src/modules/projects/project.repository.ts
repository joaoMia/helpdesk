import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { ProjectCatalogRepository } from './project-catalog.repository.js';
import { AttachmentStorage } from '../tickets/attachment-storage.js';
import {
  ProjectWorkflowRepository,
  operationHash,
} from './project-workflow.repository.js';
import { resourceNotFound } from '../authorization/permissions.js';

const selection = {
  id: true,
  code: true,
  title: true,
  objective: true,
  need: true,
  createdAt: true,
  priority: true,
} as const;
export class ProjectRepository {
  constructor(
    readonly db: PrismaClient,
    readonly attachments = new AttachmentStorage(undefined, 'projects'),
  ) {}
  private scope(identity: Identity): Prisma.ProjectRequestWhereInput {
    return identity.user.role === 'ADMIN'
      ? { retirement: { is: null } }
      : { requesterId: identity.user.id, retirement: { is: null } };
  }
  list(
    identity: Identity,
    q: { page: number; pageSize: number; search: string },
  ) {
    const where = {
      ...this.scope(identity),
      ...(q.search
        ? {
            OR: [
              { title: { contains: q.search, mode: 'insensitive' as const } },
              {
                objective: { contains: q.search, mode: 'insensitive' as const },
              },
            ],
          }
        : {}),
    };
    return this.db.$transaction(
      async (tx) => ({
        items: await tx.projectRequest.findMany({
          where,
          select: selection,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: q.pageSize,
          skip: (q.page - 1) * q.pageSize,
        }),
        total: await tx.projectRequest.count({ where }),
        page: q.page,
        pageSize: q.pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detail(identity: Identity, id: string) {
    const item = await this.db.projectRequest.findFirst({
      where: { ...this.scope(identity), id },
      select: selection,
    });
    if (!item) throw resourceNotFound();
    return item;
  }
  history(identity: Identity, id: string) {
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.projectRequest.findFirst({
            where: { ...this.scope(identity), id },
            select: { id: true },
          }))
        )
          throw resourceNotFound();
        return tx.projectRequestEvent.findMany({
          where: { projectId: id },
          select: { id: true, type: true, createdAt: true },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 50,
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  create(
    identity: Identity,
    data: {
      title: string;
      objective: string;
      need: string;
      clientOperationId: string;
      form?: {
        categoryId: string;
        versionId: string;
        answers: Record<string, unknown>;
      };
    },
  ) {
    return this.db.$transaction(
      async (tx) => {
        const workflow = new ProjectWorkflowRepository(this.db);
        await workflow.actor(tx, identity);
        const { clientOperationId, ...fields } = data;
        const hash = operationHash({ creation: fields });
        const replay = await workflow.replay(
          tx,
          identity,
          clientOperationId,
          hash,
        );
        if (replay !== undefined)
          return replay as {
            id: string;
            code: number;
            title: string;
            objective: string;
            need: string;
            createdAt: string;
          };
        const now = new Date();
        const { form, ...originalFields } = fields;
        const project = await tx.projectRequest.create({
          data: {
            ...originalFields,
            priority: null,
            requesterId: identity.user.id,
            createdAt: now,
          },
          select: selection,
        });
        if (form)
          await new ProjectCatalogRepository(this.db).capture(
            tx,
            project.id,
            form.categoryId,
            form.versionId,
            form.answers,
            identity,
            this.attachments,
          );
        await tx.projectRequestEvent.create({
          data: {
            projectId: project.id,
            actorId: identity.user.id,
            type: 'REQUESTED',
            createdAt: now,
          },
        });
        const dto = { ...project, createdAt: project.createdAt.toISOString() };
        await workflow.remember(
          tx,
          identity,
          clientOperationId,
          project.id,
          hash,
          dto,
        );
        return dto;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }
}
