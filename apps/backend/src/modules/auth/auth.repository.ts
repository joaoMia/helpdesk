import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';

export type AuthDatabase = PrismaClient;
export type AuthUser = Prisma.UserGetPayload<Record<string, never>>;
export class AuthRepository {
  constructor(private readonly db: AuthDatabase) {}
  findUser(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }
  async findByEmail(email: string) {
    // Literal equality uses the case-insensitive index, never ILIKE wildcards.
    const rows = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT id FROM users WHERE lower(email)=${email}`;
    return rows[0] ? this.findUser(rows[0].id) : null;
  }
  register(name: string, email: string, passwordHash: string) {
    return this.db.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'REQUESTER',
        isActive: true,
        mustChangePassword: false,
      },
    });
  }
  session(id: string) {
    return this.db.authSession.findUnique({
      where: { id },
      include: { user: true },
    });
  }
  async createSession(
    userId: string,
    passwordHash: string,
    email: string,
    id: string,
    tokenHash: string,
    expiresAt: Date,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (
        !user?.isActive ||
        user.passwordHash !== passwordHash ||
        user.email !== email
      )
        return null;
      await tx.authSession.create({
        data: {
          id,
          userId,
          expiresAt,
          refreshTokens: { create: { tokenHash, expiresAt } },
        },
      });
      return user;
    });
  }
  async rotate(tokenHash: string, replacementHash: string, now: Date) {
    return this.db.$transaction(async (tx) => {
      const found = await tx.authRefreshToken.findUnique({
        where: { tokenHash },
      });
      if (!found) return null;
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${found.sessionId}::uuid FOR UPDATE`;
      const token = await tx.authRefreshToken.findUnique({
        where: { tokenHash },
        include: { session: { include: { user: true } } },
      });
      if (!token || token.session.revokedAt || token.session.expiresAt <= now)
        return null;
      if (token.consumedAt || !token.session.user.isActive) {
        await tx.authSession.update({
          where: { id: token.sessionId },
          data: {
            revokedAt: now,
            revokeReason: token.consumedAt ? 'REFRESH_REUSE' : 'USER_INACTIVE',
          },
        });
        // Return, rather than throw, so revocation commits even on rejected reuse.
        return null;
      }
      if (token.expiresAt <= now) return null;
      await tx.authRefreshToken.update({
        where: { id: token.id },
        data: { consumedAt: now },
      });
      await tx.authRefreshToken.create({
        data: {
          sessionId: token.sessionId,
          tokenHash: replacementHash,
          expiresAt: token.session.expiresAt,
        },
      });
      await tx.authSession.update({
        where: { id: token.sessionId },
        data: { lastUsedAt: now },
      });
      return token.session;
    });
  }
  async logout(tokenHash: string, now: Date) {
    const token = await this.db.authRefreshToken.findUnique({
      where: { tokenHash },
    });
    if (token)
      await this.db.authSession.updateMany({
        where: { id: token.sessionId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'LOGOUT' },
      });
  }
  revokeSession(id: string, now: Date) {
    return this.db.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now, revokeReason: 'LOGOUT' },
    });
  }
  async changePassword(
    userId: string,
    sessionId: string,
    expectedHash: string,
    passwordHash: string,
    now: Date,
  ) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId } });
      const session = await tx.authSession.findUnique({
        where: { id: sessionId },
      });
      if (
        !user?.isActive ||
        user.passwordHash !== expectedHash ||
        !session ||
        session.userId !== userId ||
        session.revokedAt ||
        session.expiresAt <= now
      )
        return false;
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      });
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now, revokeReason: 'PASSWORD_CHANGED' },
      });
      return true;
    });
  }
}
