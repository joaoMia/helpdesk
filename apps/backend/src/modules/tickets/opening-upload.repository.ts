import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import { resourceNotFound } from '../authorization/permissions.js';
import { ApplicationError } from '../../shared/errors.js';
import { prismaTicketUnit } from './prisma-ticket.repository.js';
export class OpeningUploadRepository {
  constructor(private db: PrismaClient) {}
  private secured<T>(
    identity: Identity,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
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
          u.role !== 'REQUESTER' ||
          !u.isActive ||
          u.mustChangePassword ||
          !s ||
          s.userId !== u.id ||
          s.revokedAt ||
          s.expiresAt <= new Date()
        )
          throw invalidSession();
        return operation(tx);
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }
  insert(
    identity: Identity,
    input: { serviceId: string; formVersionId: string; fieldKey: string },
    file: {
      name: string;
      mime: string;
      size: number;
      sha256: string;
      storageKey: string;
    },
  ) {
    return this.secured(identity, async (tx) => {
      const service = await prismaTicketUnit(tx).findCatalog(input.serviceId);
      const field = service?.form?.fields.find(
        (f) => f.key === input.fieldKey && f.type === 'FILE',
      );
      if (
        !service?.active ||
        !service.category.active ||
        service.form?.id !== input.formVersionId ||
        !field
      )
        throw resourceNotFound();
      if (
        (await tx.openingUpload.count({
          where: { ownerId: identity.user.id, expiresAt: { gt: new Date() } },
        })) >= 10
      )
        throw new ApplicationError(
          'UPLOAD_LIMIT',
          409,
          'Remova um anexo pendente antes de enviar outro. Limite de dez arquivos.',
        );
      return tx.openingUpload.create({
        data: {
          ...input,
          ...file,
          fieldId: field.id,
          ownerId: identity.user.id,
          expiresAt: new Date(Date.now() + 86400000),
        },
      });
    });
  }
  discard(identity: Identity, id: string) {
    return this.secured(identity, async (tx) => {
      const f = await tx.openingUpload.findFirst({
        where: { id, ownerId: identity.user.id },
      });
      if (!f) throw resourceNotFound();
      await tx.openingUpload.delete({ where: { id } });
      return f;
    });
  }
}
