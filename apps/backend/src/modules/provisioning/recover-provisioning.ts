import type { PrismaClient } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../shared/errors.js';
import { hashPassword } from '../auth/password.js';
import {
  automaticIdentities,
  automaticPlan,
} from './automatic-provisioning.js';
import type { PrepareCredentialDelivery } from './automatic-provisioning.js';
import {
  inspectProvisioning,
  provisioningSlots,
} from './development-provisioning.js';

export async function recoverProvisioning(
  db: PrismaClient,
  prepare: PrepareCredentialDelivery,
) {
  await inspectProvisioning(db, automaticIdentities);
  const entries = automaticPlan();
  let delivery: Awaited<ReturnType<PrepareCredentialDelivery>> | undefined;
  let confirmed = false;
  try {
    const hashes = await Promise.all(
      entries.map((e) => hashPassword(e.password!)),
    );
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(194019, 1)`;
        // Same user locks as login/change-password: no concurrent login may slip
        // between the active-session check and password replacement.
        for (const slot of provisioningSlots)
          await tx.$queryRaw`SELECT id FROM users WHERE id=${slot.id}::uuid FOR UPDATE`;
        const users = await tx.user.findMany({
          where: { id: { in: provisioningSlots.map((s) => s.id) } },
        });
        for (const [i, slot] of provisioningSlots.entries()) {
          const user = users.find((u) => u.id === slot.id);
          if (
            !user ||
            user.email !== automaticIdentities[i]!.email ||
            user.role !== slot.role ||
            !user.isActive ||
            !user.mustChangePassword
          )
            throw new ApplicationError(
              'RECOVERY_BLOCKED',
              409,
              'Conta ausente, incompatível, inativa ou com troca inicial concluída. Nenhuma senha alterada.',
            );
        }
        const now = new Date();
        if (
          await tx.authSession.count({
            where: {
              userId: { in: users.map((u) => u.id) },
              revokedAt: null,
              expiresAt: { gt: now },
            },
          })
        )
          throw new ApplicationError(
            'RECOVERY_BLOCKED',
            409,
            'Existe sessão ativa em uma das contas. Nenhuma senha alterada; revisão específica necessária.',
          );
        delivery = await prepare(entries);
        for (const [i, slot] of provisioningSlots.entries()) {
          await tx.user.update({
            where: { id: slot.id },
            data: { passwordHash: hashes[i]! },
          });
          await tx.authSession.updateMany({
            where: { userId: slot.id, revokedAt: null },
            data: { revokedAt: now, revokeReason: 'DEV_CREDENTIAL_RECOVERY' },
          });
        }
      },
      { timeout: 20000 },
    );
    confirmed = true;
    await delivery!.finish('commit');
    return delivery!.path;
  } catch (error) {
    // Keep the protected file on any ambiguous SQL acknowledgement. It must not
    // be lost after passwords may have committed. No automatic retry/reset.
    if (delivery && !confirmed) await delivery.finish('commit');
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError(
      'RECOVERY_FAILED',
      503,
      'Recuperação não confirmada. Confira arquivo e banco localmente; não repita sem revisão.',
    );
  } finally {
    for (const entry of entries) entry.password = undefined;
  }
}
