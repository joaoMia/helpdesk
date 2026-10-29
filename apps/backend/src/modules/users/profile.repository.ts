import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import type { UpdateProfile } from '@helpdesk/contracts';
export class ProfileRepository {
  constructor(private db: PrismaClient) {}
  find(id: string) {
    return this.db.user.findUnique({ where: { id } });
  }
  update(
    identity: Identity,
    input: UpdateProfile,
    expected: { email: string; passwordHash: string },
  ) {
    return this.db.$transaction(async (tx) => {
      const id = identity.user.id;
      await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id } });
      const session = await tx.authSession.findUnique({
        where: { id: identity.sessionId },
      });
      const now = new Date();
      if (
        !user ||
        user.role !== 'REQUESTER' ||
        !user.isActive ||
        user.mustChangePassword ||
        user.email !== expected.email ||
        user.passwordHash !== expected.passwordHash ||
        !session ||
        session.userId !== id ||
        session.revokedAt ||
        session.expiresAt <= now
      )
        throw invalidSession();
      const reauthenticate =
        input.email !== undefined && input.email !== user.email;
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(reauthenticate ? { email: input.email } : {}),
        },
      });
      if (reauthenticate)
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: now, revokeReason: 'EMAIL_CHANGED' },
        });
      return { user: updated, reauthenticate };
    });
  }
}
