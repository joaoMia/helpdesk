import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import argon2 from 'argon2';
import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/client.js';
import {
  provisioningTarget,
  provisioningSlots,
} from '../src/modules/provisioning/development-provisioning.js';
import { automaticIdentities } from '../src/modules/provisioning/automatic-provisioning.js';
import { recoverProvisioning } from '../src/modules/provisioning/recover-provisioning.js';
import { prepareProtectedCredentials } from './protected-credentials.js';
import { requireSecureTerminal, readText } from './secure-console.js';
import { ApplicationError } from '../src/shared/errors.js';

async function run() {
  requireSecureTerminal(process.stdin, process.stdout);
  if (
    process.argv.length !== 2 ||
    process.platform !== 'win32' ||
    !process.env.LOCALAPPDATA
  )
    throw new Error();
  const file = path.resolve(
    process.env.LOCALAPPDATA,
    'HelpDesk',
    'credenciais-iniciais-dev.txt',
  );
  console.log(`Destino no contexto deste terminal: ${file}`);
  const db = createDatabase(provisioningTarget(loadEnvironment()));
  try {
    if (existsSync(file)) {
      const bytes = readFileSync(file);
      try {
        const matches = [
          ...bytes
            .toString('utf8')
            .matchAll(
              /E-mail: ([^\r\n]+)\r?\nSenha provisoria: ([A-Za-z0-9_-]{32})/g,
            ),
        ];
        for (const [i, slot] of provisioningSlots.entries()) {
          const user = await db.user.findUnique({ where: { id: slot.id } });
          const secret = matches.find(
            (m) => m[1] === automaticIdentities[i]!.email,
          )?.[2];
          if (
            !user ||
            user.role !== slot.role ||
            user.email !== automaticIdentities[i]!.email ||
            !secret ||
            !(await argon2.verify(user.passwordHash, secret))
          )
            throw new Error();
        }
        console.log(
          'Arquivo original acessível e credenciais conferidas. Nenhuma senha redefinida. Abra o arquivo diretamente no Windows.',
        );
        return;
      } finally {
        bytes.fill(0);
      }
    }
    console.log(
      'Arquivo original ausente neste terminal. A recuperação substitui somente as quatro credenciais provisórias elegíveis; não cria usuários.',
    );
    const answer = await readText(
      'Digite RECUPERAR para confirmar a redefinição',
      'CANCELAR',
    );
    if (answer !== 'RECUPERAR') {
      console.log('Cancelado; nenhuma alteração.');
      return;
    }
    const result = await recoverProvisioning(db, prepareProtectedCredentials);
    const check = readFileSync(result);
    check.fill(0);
    console.log(
      `Recuperação confirmada; arquivo acessível neste terminal: ${result}`,
    );
  } finally {
    await db.$disconnect();
  }
}
void run().catch((error: unknown) => {
  console.error(
    error instanceof ApplicationError
      ? error.message
      : 'Não foi possível validar a entrega local. Nenhum arquivo existente será sobrescrito; confira contexto Windows, ACL e banco. Detalhes confidenciais omitidos.',
  );
  process.exitCode = 1;
});
