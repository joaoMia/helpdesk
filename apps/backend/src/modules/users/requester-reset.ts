import { emailSchema, passwordSchema } from '@helpdesk/contracts';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { loadEnvironment } from '../../config/env.js';
import { assertProvisioningDatabase } from '../provisioning/development-provisioning.js';
import { hashPassword } from '../auth/password.js';
import { ApplicationError } from '../../shared/errors.js';
const blocked = () =>
  new ApplicationError(
    'RESET_BLOCKED',
    409,
    'Conta inexistente, inativa, incompatível ou alterada durante a operação. Nenhuma senha redefinida.',
  );
async function target(db: PrismaClient) {
  const [row] = await db.$queryRaw<
    { database: string; schema: string }[]
  >`SELECT current_database() AS database,current_schema() AS schema`;
  assertProvisioningDatabase(
    loadEnvironment().NODE_ENV,
    row?.database ?? '',
    row?.schema ?? '',
  );
}
export async function selectRequester(db: PrismaClient, email: unknown) {
  await target(db);
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) throw blocked();
  const rows = await db.$queryRaw<
    { id: string }[]
  >`SELECT id FROM users WHERE lower(email)=${parsed.data} AND role='REQUESTER' AND is_active=true`;
  const user = rows[0]
    ? await db.user.findUnique({ where: { id: rows[0].id } })
    : null;
  if (
    !user ||
    user.role !== 'REQUESTER' ||
    !user.isActive ||
    user.email.toLowerCase() !== parsed.data
  )
    throw blocked();
  return { id: user.id, email: user.email, passwordHash: user.passwordHash };
}
export async function resetRequester(
  db: PrismaClient,
  selected: Awaited<ReturnType<typeof selectRequester>>,
  password: string,
  confirmation: string,
) {
  await target(db);
  if (!passwordSchema.safeParse(password).success || password !== confirmation)
    throw new ApplicationError(
      'RESET_INPUT',
      400,
      'Use uma senha de 12–128 caracteres e confirmação idêntica. Nenhuma alteração.',
    );
  const hash = await hashPassword(password);
  try {
    await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id=${selected.id}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: selected.id } });
      if (
        !user ||
        user.role !== 'REQUESTER' ||
        !user.isActive ||
        user.email !== selected.email ||
        user.passwordHash !== selected.passwordHash
      )
        throw blocked();
      // Preserve every other users column, including flags and timestamps.
      await tx.$executeRaw`UPDATE users SET password_hash=${hash} WHERE id=${user.id}::uuid`;
      await tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokeReason: 'DEV_REQUESTER_PASSWORD_RESET',
        },
      });
    });
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw new ApplicationError(
      'RESET_FAILED',
      503,
      'Redefinição não confirmada. Verifique o ambiente local; não repita automaticamente.',
    );
  }
}
