import {
  syncReferenceForms,
  syncSingleSystemForm,
} from '../src/modules/catalog/sync-forms.js';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { loadEnvironment } from '../src/config/env.js';
import { developmentMigrationTarget } from '../src/database/test-target.js';
import { createDatabase } from '../src/database/client.js';
import { syncReferenceCatalog } from '../src/modules/catalog/sync-reference.js';

async function run() {
  const args = process.argv.slice(2),
    apply = args.includes('--apply'),
    backupArg = args.find((a) => a.startsWith('--backup='));
  if (
    args.some(
      (a) => a !== '--apply' && a !== '--forms' && !a.startsWith('--backup='),
    )
  )
    throw Error('Argumento não permitido.');
  const env = loadEnvironment(),
    target = developmentMigrationTarget(env, env.NODE_ENV);
  if (apply) {
    if (!backupArg)
      throw Error('Informe o backup verificável com --backup=caminho.');
    const root = realpathSync(
        new URL('../../../.local/backups/', import.meta.url),
      ),
      file = realpathSync(resolve(backupArg.slice(9))),
      r = relative(root, file);
    if (
      !r ||
      r.startsWith('..') ||
      isAbsolute(r) ||
      !/^helpdesk_dev_[\dTZ-]+\.dump$/.test(r)
    )
      throw Error('Backup fora do diretório autorizado.');
    const bytes = readFileSync(file),
      hash = createHash('sha256').update(bytes).digest('hex');
    if (
      bytes.subarray(0, 5).toString() !== 'PGDMP' ||
      readFileSync(file + '.sha256', 'utf8').trim() !== hash
    )
      throw Error('Backup inválido.');
  }
  const db = createDatabase(target.connectionString);
  try {
    const [actual] = await db.$queryRaw<
      { name: string; schema: string }[]
    >`SELECT current_database() AS name,current_schema() AS schema`;
    if (actual?.name !== 'helpdesk_dev' || actual.schema !== 'public')
      throw Error('Destino efetivo inválido.');
    console.log(await syncReferenceCatalog(db, apply));
    if (args.includes('--forms'))
      console.log({ singleSystem: await syncSingleSystemForm(db, apply) });
    if (args.includes('--forms'))
      console.log({ forms: await syncReferenceForms(db, apply) });
  } finally {
    await db.$disconnect();
  }
}
run().catch(() => {
  console.error(
    'Sincronização recusada ou não confirmada. Nenhum dado existente é sobrescrito; detalhes internos omitidos.',
  );
  process.exitCode = 1;
});
