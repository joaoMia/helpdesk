import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type {
  CatalogQuery,
  CategoryInput,
  CategoryUpdate,
  ServiceInput,
  ServiceUpdate,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import { resourceNotFound } from '../authorization/permissions.js';
import { ApplicationError } from '../../shared/errors.js';
export type CatalogKind = 'categories' | 'services';
const reader = {
  id: true,
  name: true,
  description: true,
  displayOrder: true,
} as const;
const administration = {
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;
const conflict = (message: string) =>
  new ApplicationError('CATALOG_CONFLICT', 409, message);
export class CatalogRepository {
  constructor(private db: PrismaClient) {}
  private projection(admin: boolean) {
    return { ...reader, ...(admin ? administration : {}) };
  }
  private where(admin: boolean, query: CatalogQuery) {
    return {
      AND: [
        ...(!admin ? [{ isActive: true }] : []),
        ...(query.status !== 'all'
          ? [{ isActive: query.status === 'active' }]
          : []),
        ...(query.search
          ? [
              {
                OR: [
                  {
                    name: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                  {
                    description: {
                      contains: query.search,
                      mode: 'insensitive' as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };
  }
  list(kind: CatalogKind, admin: boolean, q: CatalogQuery) {
    const paging = {
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      orderBy: [
        { displayOrder: 'asc' as const },
        { name: 'asc' as const },
        { id: 'asc' as const },
      ],
    };
    return this.db.$transaction(
      async (tx) => {
        if (kind === 'categories') {
          const where = this.where(admin, q);
          return {
            items: await tx.serviceCategory.findMany({
              where,
              select: this.projection(admin),
              ...paging,
            }),
            total: await tx.serviceCategory.count({ where }),
            page: q.page,
            pageSize: q.pageSize,
          };
        }
        const where = {
          ...this.where(admin, q),
          ...(!admin ? { category: { isActive: true } } : {}),
          ...(q.categoryId ? { categoryId: q.categoryId } : {}),
        };
        return {
          items: await tx.service.findMany({
            where,
            select: {
              ...this.projection(admin),
              categoryId: true,
              category: {
                select: {
                  id: true,
                  name: true,
                  ...(admin ? { isActive: true } : {}),
                },
              },
            },
            ...paging,
          }),
          total: await tx.service.count({ where }),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detail(kind: CatalogKind, admin: boolean, id: string) {
    const where = { id, ...(!admin ? { isActive: true } : {}) };
    const result =
      kind === 'categories'
        ? await this.db.serviceCategory.findFirst({
            where,
            select: this.projection(admin),
          })
        : await this.db.service.findFirst({
            where: {
              ...where,
              ...(!admin ? { category: { isActive: true } } : {}),
            },
            select: {
              ...this.projection(admin),
              categoryId: true,
              category: {
                select: {
                  id: true,
                  name: true,
                  ...(admin ? { isActive: true } : {}),
                },
              },
            },
          });
    if (!result) throw resourceNotFound();
    return result;
  }
  private async actor(tx: Prisma.TransactionClient, identity: Identity) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: identity.user.id } }),
      session = await tx.authSession.findUnique({
        where: { id: identity.sessionId },
      });
    if (
      !user ||
      user.role !== 'ADMIN' ||
      !user.isActive ||
      user.mustChangePassword ||
      !session ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw invalidSession();
  }
  writeCategory(
    identity: Identity,
    input: CategoryInput | CategoryUpdate,
    id?: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, identity);
        if (id) {
          await tx.$queryRaw`SELECT id FROM service_categories WHERE id=${id}::uuid FOR UPDATE`;
          if (!(await tx.serviceCategory.findUnique({ where: { id } })))
            throw resourceNotFound();
          return tx.serviceCategory.update({
            where: { id },
            data: input,
            select: { ...reader, ...administration },
          });
        }
        return tx.serviceCategory.create({
          data: input as CategoryInput,
          select: { ...reader, ...administration },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  writeService(
    identity: Identity,
    input: ServiceInput | ServiceUpdate,
    id?: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, identity);
        const previous = id
          ? await tx.service.findUnique({ where: { id } })
          : null;
        if (id && !previous) throw resourceNotFound();
        const categoryId = input.categoryId ?? previous!.categoryId;
        // Categories precede services in the lock order, also used by opening.
        const oldCategory = previous?.categoryId ?? categoryId;
        await tx.$queryRaw`SELECT id FROM service_categories WHERE id IN (${oldCategory}::uuid,${categoryId}::uuid) ORDER BY id FOR SHARE`;
        const category = await tx.serviceCategory.findUnique({
          where: { id: categoryId },
        });
        if (!category) throw resourceNotFound();
        if (id)
          await tx.$queryRaw`SELECT id FROM services WHERE id=${id}::uuid FOR UPDATE`;
        if (
          (input.isActive ?? previous?.isActive ?? true) &&
          !category.isActive
        )
          throw conflict('Ative a categoria antes de salvar um serviço ativo.');
        if (
          previous &&
          categoryId !== previous.categoryId &&
          (await tx.ticket.count({ where: { serviceId: id } }))
        )
          throw conflict(
            'Serviço com chamados vinculados não pode mudar de categoria.',
          );
        const select = {
          ...reader,
          ...administration,
          categoryId: true,
          category: { select: { id: true, name: true, isActive: true } },
        } as const;
        if (id)
          return tx.service.update({ where: { id }, data: input, select });
        return tx.service.create({
          data: {
            ...(input as ServiceInput),
            forms: { create: { version: 1 } },
          },
          select,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
