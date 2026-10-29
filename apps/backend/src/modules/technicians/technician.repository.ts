import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import { resourceNotFound } from '../authorization/permissions.js';
import type { TechnicianInput, TechnicianUpdate } from '@helpdesk/contracts';
const select = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
} as const;
export class TechnicianRepository {
  constructor(private db: PrismaClient) {}
  list(query: { page: number; pageSize: number; search: string }) {
    const where: Prisma.UserWhereInput = {
      role: 'TECHNICIAN',
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    return this.db.$transaction(
      async (tx) => ({
        items: await tx.user.findMany({
          where,
          select,
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        total: await tx.user.count({ where }),
        page: query.page,
        pageSize: query.pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async detail(id: string) {
    const user = await this.db.user.findFirst({
      where: { id, role: 'TECHNICIAN' },
      select,
    });
    if (!user) throw resourceNotFound();
    return user;
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
  create(identity: Identity, input: TechnicianInput, passwordHash: string) {
    return this.db.$transaction(async (tx) => {
      await this.actor(tx, identity);
      return tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          role: 'TECHNICIAN',
          isActive: true,
          mustChangePassword: true,
        },
        select,
      });
    });
  }
  update(identity: Identity, id: string, input: TechnicianUpdate) {
    return this.db.$transaction(async (tx) => {
      await this.actor(tx, identity);
      await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid AND role='TECHNICIAN' FOR UPDATE`;
      const existing = await tx.user.findFirst({
        where: { id, role: 'TECHNICIAN' },
      });
      if (!existing) throw resourceNotFound();
      const result = await tx.user.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.email !== undefined ? { email: input.email } : {}),
        },
        select,
      });
      if (input.email !== undefined && input.email !== existing.email)
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: 'EMAIL_CHANGED' },
        });
      return result;
    });
  }
}
