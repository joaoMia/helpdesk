import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { loadEnvironment } from '../src/config/env.js';
import { developmentMigrationTarget } from '../src/database/test-target.js';
import { createDatabase } from '../src/database/client.js';
import { ProjectCatalogRepository } from '../src/modules/projects/project-catalog.repository.js';
import { projectCategoryReferences } from '../src/modules/projects/project-form-reference.js';
async function run() {
  const args = process.argv.slice(2),
    apply = args.includes('--apply'),
    backup = args.find((a) => a.startsWith('--backup='));
  if (args.some((a) => a !== '--apply' && !a.startsWith('--backup=')))
    throw Error('Argumento inválido.');
  const env = loadEnvironment(),
    target = developmentMigrationTarget(env, env.NODE_ENV);
  if (apply) {
    if (!backup) throw Error('Backup verificável obrigatório.');
    const root = realpathSync(
        new URL('../../../.local/backups/', import.meta.url),
      ),
      file = realpathSync(resolve(backup.slice(9))),
      r = relative(root, file);
    if (
      !r ||
      r.startsWith('..') ||
      isAbsolute(r) ||
      !/^helpdesk_dev_[\dTZ-]+\.dump$/.test(r)
    )
      throw Error('Backup fora do diretório autorizado.');
    const bytes = readFileSync(file);
    if (
      bytes.subarray(0, 5).toString() !== 'PGDMP' ||
      readFileSync(file + '.sha256', 'utf8').trim() !==
        createHash('sha256').update(bytes).digest('hex')
    )
      throw Error('Backup inválido.');
  }
  const db = createDatabase(target.connectionString);
  try {
    const actual = await db.$queryRaw<
      { name: string; schema: string }[]
    >`SELECT current_database() name,current_schema() schema`;
    if (actual[0]?.name !== 'helpdesk_dev' || actual[0]?.schema !== 'public')
      throw Error('Destino inválido.');
    if (!apply) {
      const categories = await db.$queryRaw<
        { reference_key: string | null; name: string }[]
      >`SELECT reference_key,name FROM project_categories`;
      const existing = projectCategoryReferences.filter((c) =>
        categories.some((e) => e.reference_key === c.key),
      );
      const conflicts = projectCategoryReferences.filter(
        (c) =>
          !existing.includes(c) &&
          categories.some(
            (e) => e.name.trim().toLowerCase() === c.name.trim().toLowerCase(),
          ),
      );
      console.log({
        database: target.database,
        apply: false,
        existing: existing.length,
        conflicts: conflicts.map((c) => c.key),
        missing:
          projectCategoryReferences.length - existing.length - conflicts.length,
      });
      return;
    }
    const actor = await db.user.findFirst({
      where: { role: 'ADMIN', isActive: true, mustChangePassword: false },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        mustChangePassword: true,
      },
    });
    if (!actor)
      throw Error(
        'ADMIN elegível necessário para autoria de cadastro inicial.',
      );
    console.log({
      database: target.database,
      initiator: 'development-cli',
      ...(await new ProjectCatalogRepository(db).bootstrap(
        { user: actor, sessionId: '' },
        true,
      )),
    });
  } finally {
    await db.$disconnect();
  }
}
run().catch(() => {
  console.error(
    'Sincronização de categorias de Projetos não confirmada. Nenhum dado existente é sobrescrito; detalhes internos omitidos.',
  );
  process.exitCode = 1;
});
