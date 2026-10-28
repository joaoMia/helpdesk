import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/client.js';
import { provisioningTarget } from '../src/modules/provisioning/development-provisioning.js';
import { provisionAutomatically } from '../src/modules/provisioning/automatic-provisioning.js';
import { prepareProtectedCredentials } from './protected-credentials.js';
import { ApplicationError } from '../src/shared/errors.js';

async function run() {
  if (process.argv.length !== 2)
    throw new ApplicationError(
      'PROVISIONING_INPUT',
      400,
      'Execute sem argumentos; credenciais são geradas internamente.',
    );
  const target = provisioningTarget(loadEnvironment());
  const db = createDatabase(target);
  try {
    const result = await provisionAutomatically(
      db,
      prepareProtectedCredentials,
    );
    console.log(
      'Quatro contas criadas em helpdesk_dev; ativas, com troca inicial obrigatória.',
    );
    console.log(
      `Acessos disponíveis somente no arquivo protegido: ${result.path}`,
    );
  } finally {
    await db.$disconnect();
  }
}
void run().catch((error: unknown) => {
  console.error(
    error instanceof ApplicationError
      ? error.message
      : 'Provisionamento não confirmado. Revise o arquivo protegido e as contas localmente; detalhes omitidos.',
  );
  process.exitCode = 1;
});
