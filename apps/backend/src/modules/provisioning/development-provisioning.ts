import { z } from 'zod';
import {
  emailSchema,
  passwordSchema,
  registerSchema,
} from '@helpdesk/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { loadEnvironment } from '../../config/env.js';
import { hashPassword } from '../auth/password.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';

// Stable development slots, not credentials. Never adopt a preexisting account
// merely because its e-mail or role matches a desired account.
export const provisioningSlots = [
  {
    key: 'admin',
    id: 'ed005000-0000-4000-8000-000000000001',
    role: 'ADMIN',
    label: 'Administrador local',
    email: 'admin.local@helpdesk.test',
  },
  {
    key: 'technician1',
    id: 'ed005000-0000-4000-8000-000000000002',
    role: 'TECHNICIAN',
    label: 'Técnico local 1',
    email: 'tecnico1.local@helpdesk.test',
  },
  {
    key: 'technician2',
    id: 'ed005000-0000-4000-8000-000000000003',
    role: 'TECHNICIAN',
    label: 'Técnico local 2',
    email: 'tecnico2.local@helpdesk.test',
  },
  {
    key: 'technician3',
    id: 'ed005000-0000-4000-8000-000000000004',
    role: 'TECHNICIAN',
    label: 'Técnico local 3',
    email: 'tecnico3.local@helpdesk.test',
  },
] as const;
const slotKey = z.enum(['admin', 'technician1', 'technician2', 'technician3']);
export const provisioningEmail = emailSchema.refine(
  (value) => /\.(test|invalid)$/.test(value),
  'Utilize um alias de teste terminado em .test ou .invalid.',
);
const entrySchema = z.strictObject({
  slot: slotKey,
  name: registerSchema.shape.name,
  email: provisioningEmail,
  password: passwordSchema.optional(),
});
const planSchema = z
  .array(entrySchema)
  .length(4)
  .refine(
    (entries) =>
      new Set(entries.map((e) => e.slot)).size === 4 &&
      new Set(entries.map((e) => e.email)).size === 4,
  );
export type ProvisioningEntry = z.infer<typeof entrySchema>;
type Existing = { id: string; name: string; email: string; role: string };
const conflict = () =>
  new ApplicationError(
    'PROVISIONING_CONFLICT',
    409,
    'Conflito de identificador, e-mail ou perfil. Nenhuma conta existente será alterada; confira as identidades do lote.',
  );

export function provisioningTarget(config: {
  NODE_ENV: string;
  DATABASE_URL?: string;
}) {
  try {
    const url = new URL(config.DATABASE_URL ?? '');
    if (
      config.NODE_ENV !== 'development' ||
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      decodeURIComponent(url.pathname) !== '/helpdesk_dev' ||
      [...url.searchParams.keys()].some((key) => key !== 'schema') ||
      ![null, 'public'].includes(url.searchParams.get('schema'))
    )
      throw new Error();
    return config.DATABASE_URL!;
  } catch {
    throw new ApplicationError(
      'PROVISIONING_TARGET',
      403,
      'Provisionamento permitido somente em development e helpdesk_dev local/public.',
    );
  }
}
export function assertProvisioningDatabase(
  mode: string,
  database: string,
  schema: string,
) {
  if (
    (mode === 'development' &&
      database === 'helpdesk_dev' &&
      schema === 'public') ||
    (mode === 'test' &&
      process.env.NODE_ENV === 'test' &&
      database === 'helpdesk_test' &&
      /^dev003_[a-f0-9]{32}$/.test(schema))
  )
    return;
  throw new ApplicationError(
    'PROVISIONING_TARGET',
    403,
    'Banco ou ambiente não autorizado para provisionamento.',
  );
}
async function assertTarget(db: PrismaClient) {
  const [row] = await db.$queryRaw<
    { database: string; schema: string }[]
  >`SELECT current_database() AS database, current_schema() AS schema`;
  assertProvisioningDatabase(
    loadEnvironment().NODE_ENV,
    row?.database ?? '',
    row?.schema ?? '',
  );
}
function parsePlan(input: unknown) {
  const result = planSchema.safeParse(input);
  if (!result.success)
    throw new ApplicationError(
      'PROVISIONING_INPUT',
      400,
      'Informe as quatro identidades distintas, nomes válidos, aliases de teste e senhas de 12 a 128 caracteres quando necessárias.',
    );
  return result.data;
}
async function existingAccounts(
  db: Pick<PrismaClient, '$queryRaw'>,
  emails: string[],
) {
  const ids = provisioningSlots.map((slot) => Prisma.sql`${slot.id}::uuid`);
  return db.$queryRaw<
    Existing[]
  >`SELECT id, name, email, role::text AS role FROM users
    WHERE id IN (${Prisma.join(ids)}) OR role='ADMIN'
    ${emails.length ? Prisma.sql`OR lower(email) IN (${Prisma.join(emails)})` : Prisma.empty}`;
}
function validateExisting(rows: Existing[], plan: ProvisioningEntry[]) {
  if (
    !rows.some((row) => row.id === provisioningSlots[0].id) &&
    rows.some((row) => row.role === 'ADMIN')
  )
    throw conflict();
  return provisioningSlots.map((slot) => {
    const entry = plan.find((e) => e.slot === slot.key)!;
    const byId = rows.find((row) => row.id === slot.id),
      byEmail = rows.find((row) => row.email.toLowerCase() === entry.email);
    if (
      (byId &&
        (byId.role !== slot.role ||
          byId.email.toLowerCase() !== entry.email)) ||
      (byEmail && byEmail.id !== slot.id)
    )
      throw conflict();
    return { slot, entry, existing: byId };
  });
}
export async function provisionedIdentities(db: PrismaClient) {
  await assertTarget(db);
  const rows = await existingAccounts(db, []);
  if (
    !rows.some((row) => row.id === provisioningSlots[0].id) &&
    rows.some((row) => row.role === 'ADMIN')
  )
    throw conflict();
  return provisioningSlots.map((slot) => {
    const existing = rows.find((row) => row.id === slot.id);
    if (existing && existing.role !== slot.role) throw conflict();
    return {
      slot: slot.key,
      name: existing?.name ?? slot.label,
      email: existing?.email ?? slot.email,
      exists: !!existing,
    };
  });
}
export async function inspectProvisioning(db: PrismaClient, input: unknown) {
  await assertTarget(db);
  const plan = parsePlan(input),
    rows = await existingAccounts(
      db,
      plan.map((e) => e.email),
    );
  return validateExisting(rows, plan).map(({ slot, existing }) => ({
    slot: slot.key,
    exists: !!existing,
  }));
}
export async function provisionDevelopment(
  db: PrismaClient,
  input: unknown,
  options: {
    requireAllNew?: boolean;
    beforeCreate?: () => Promise<void>;
  } = {},
) {
  await assertTarget(db);
  let plan: ProvisioningEntry[] = [];
  const hashes = new Map<string, string>();
  try {
    plan = parsePlan(input);
    const passwords = plan
      .map((e) => e.password)
      .filter((s): s is string => s !== undefined);
    if (new Set(passwords).size !== passwords.length)
      throw new ApplicationError(
        'PROVISIONING_INPUT',
        400,
        'Cada conta nova precisa de uma senha própria, diferente das demais do lote.',
      );
    for (const entry of plan)
      if (entry.password !== undefined)
        hashes.set(entry.slot, await hashPassword(entry.password));
    return await db.$transaction(
      async (tx) => {
        // Serializes simultaneous runs of this command. READ COMMITTED sees the
        // preceding run's committed rows after the transaction-scoped lock waits.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(194019, 1)`;
        const rows = await existingAccounts(
          tx,
          plan.map((e) => e.email),
        );
        const checked = validateExisting(rows, plan);
        if (options.requireAllNew && checked.some((row) => row.existing))
          throw conflict();
        if (
          checked.some(
            ({ slot, existing }) => !existing && !hashes.has(slot.key),
          )
        )
          throw new ApplicationError(
            'PROVISIONING_INPUT',
            400,
            'Faltam credenciais próprias para contas novas. Nenhuma conta foi criada.',
          );
        // The automatic command must secure its local delivery file before any
        // INSERT. The callback cannot change identities, roles or password hashes.
        await options.beforeCreate?.();
        const summary: {
          slot: string;
          role: string;
          state: 'created' | 'preserved';
        }[] = [];
        for (const { slot, entry, existing } of checked) {
          if (!existing)
            await tx.user.create({
              data: {
                id: slot.id,
                name: entry.name,
                email: entry.email,
                role: slot.role,
                passwordHash: hashes.get(slot.key)!,
                isActive: true,
                mustChangePassword: true,
              },
            });
          summary.push({
            slot: slot.key,
            role: slot.role,
            state: existing ? 'preserved' : 'created',
          });
        }
        return summary;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 5000,
        timeout: 15000,
      },
    );
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    if (
      (error as { code?: string })?.code === 'P2002' ||
      databaseErrorCode(error) === '23505'
    )
      throw conflict();
    throw new ApplicationError(
      'PROVISIONING_UNAVAILABLE',
      503,
      'Não foi possível confirmar o provisionamento. Verifique o ambiente local e execute novamente; não faça reset do banco.',
    );
  } finally {
    for (const entry of plan) entry.password = undefined;
    hashes.clear();
  }
}
