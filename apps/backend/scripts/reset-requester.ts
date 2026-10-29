import {
  requireSecureTerminal,
  readText,
  readHidden,
} from './secure-console.js';
import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/client.js';
import { provisioningTarget } from '../src/modules/provisioning/development-provisioning.js';
import {
  selectRequester,
  resetRequester,
} from '../src/modules/users/requester-reset.js';
import { ApplicationError } from '../src/shared/errors.js';
async function run() {
  requireSecureTerminal(process.stdin, process.stdout);
  if (process.argv.length !== 2)
    throw new ApplicationError(
      'RESET_INPUT',
      400,
      'Execute sem argumentos; informe os dados somente no terminal.',
    );
  const db = createDatabase(provisioningTarget(loadEnvironment()));
  const buffers: Buffer[] = [];
  try {
    const email = await readText('E-mail do solicitante', '');
    const selected = await selectRequester(db, email);
    const confirm = await readText(
      'Digite REDEFINIR para alterar esta senha e revogar todas as sessões',
      'CANCELAR',
    );
    if (confirm !== 'REDEFINIR') {
      console.log('Cancelado; nenhuma alteração.');
      return;
    }
    const password = await readHidden('Nova senha (12–128 caracteres)');
    buffers.push(password);
    const confirmation = await readHidden('Confirme a nova senha');
    buffers.push(confirmation);
    await resetRequester(
      db,
      selected,
      password.toString('utf8'),
      confirmation.toString('utf8'),
    );
    console.log(
      'Senha redefinida e sessões revogadas. Entre novamente com a nova senha.',
    );
  } finally {
    for (const buffer of buffers) buffer.fill(0);
    await db.$disconnect();
  }
}
void run().catch((error: unknown) => {
  console.error(
    error instanceof ApplicationError
      ? error.message
      : 'Não foi possível confirmar a redefinição. Detalhes confidenciais omitidos.',
  );
  process.exitCode = 1;
});
