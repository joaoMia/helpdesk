import { passwordSchema, registerSchema } from '@helpdesk/contracts';
import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/client.js';
import { ApplicationError } from '../src/shared/errors.js';
import {
  provisioningTarget,
  provisioningSlots,
  provisioningEmail,
  provisionedIdentities,
  inspectProvisioning,
  provisionDevelopment,
} from '../src/modules/provisioning/development-provisioning.js';
import type { ProvisioningEntry } from '../src/modules/provisioning/development-provisioning.js';
import {
  requireSecureTerminal,
  readText,
  readHidden,
} from './secure-console.js';

async function run() {
  if (process.argv.length !== 2)
    throw new ApplicationError(
      'PROVISIONING_INPUT',
      400,
      'Execute o comando sem argumentos. Nunca informe senha na linha de comando.',
    );
  requireSecureTerminal(process.stdin, process.stdout);
  const target = provisioningTarget(loadEnvironment());
  const db = createDatabase(target),
    plan: ProvisioningEntry[] = [];
  const buffers: Buffer[] = [];
  try {
    const current = await provisionedIdentities(db);
    console.log(
      'HD-019 — quatro contas locais. Contas existentes serão preservadas. Ctrl+C cancela.',
    );
    for (const identity of current) {
      const slot = provisioningSlots.find(
        (slot) => slot.key === identity.slot,
      )!;
      const name = identity.exists
        ? identity.name
        : await readText(`${slot.label} — nome`, identity.name);
      const email = identity.exists
        ? identity.email
        : await readText(`${slot.label} — e-mail de teste`, identity.email);
      if (
        !registerSchema.shape.name.safeParse(name).success ||
        !provisioningEmail.safeParse(email).success
      )
        throw new ApplicationError(
          'PROVISIONING_INPUT',
          400,
          'Revise o nome e o alias de teste (.test ou .invalid).',
        );
      plan.push({ slot: identity.slot, name, email });
    }
    const status = await inspectProvisioning(db, plan);
    for (const entry of plan) {
      const slot = provisioningSlots.find((slot) => slot.key === entry.slot)!;
      if (status.find((row) => row.slot === entry.slot)?.exists) continue;
      const secret = await readHidden(
        `${slot.label} — senha própria (12–128 caracteres, sem eco)`,
      );
      buffers.push(secret);
      if (!passwordSchema.safeParse(secret.toString('utf8')).success)
        throw new ApplicationError(
          'PROVISIONING_INPUT',
          400,
          'A senha precisa ter de 12 a 128 caracteres. Execute novamente.',
        );
      const confirmation = await readHidden(`${slot.label} — confirme a senha`);
      buffers.push(confirmation);
      if (!secret.equals(confirmation))
        throw new ApplicationError(
          'PROVISIONING_INPUT',
          400,
          'As senhas não correspondem. Execute novamente.',
        );
      entry.password = secret.toString('utf8');
      secret.fill(0);
      confirmation.fill(0);
    }
    const summary = await provisionDevelopment(db, plan);
    console.log(
      'Provisionamento confirmado em helpdesk_dev. Resumo sem credenciais:',
    );
    for (const row of summary)
      console.log(
        `${row.slot} | ${row.role} | ${row.state === 'created' ? 'criada, troca inicial obrigatória' : 'preservada, sem alterações'}`,
      );
    console.log(
      'Entre pela tela de login e substitua a senha inicial. Nenhuma senha foi gravada em arquivo ou exibida.',
    );
  } finally {
    for (const secret of buffers) secret.fill(0);
    for (const entry of plan) entry.password = undefined;
    await db.$disconnect();
  }
}
void run().catch((error: unknown) => {
  console.error(
    error instanceof ApplicationError
      ? error.message
      : 'Não foi possível confirmar o provisionamento. Verifique o ambiente local; detalhes e credenciais omitidos.',
  );
  process.exitCode =
    error instanceof ApplicationError && error.code === 'PROVISIONING_CANCELLED'
      ? 130
      : 1;
});
