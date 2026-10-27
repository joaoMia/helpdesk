import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnvironment } from '../src/config/env.js';
import { developmentMigrationTarget } from '../src/database/test-target.js';

// Only migrations explicitly reviewed for local development. Not a production runner.
const reviewed = [
  '20261026222500_fundacao_nucleo',
  '20261026234800_auth_sessions',
];
const coreTables = [
  '_prisma_migrations',
  'service_categories',
  'service_form_fields',
  'service_form_versions',
  'services',
  'ticket_answers',
  'ticket_events',
  'tickets',
  'users',
].sort();

async function migrate() {
  const config = loadEnvironment();
  const target = developmentMigrationTarget(config, config.NODE_ENV);
  const directory = new URL('../prisma/migrations/', import.meta.url);
  const migrations = readdirSync(directory)
    .filter((name) => /^\d{14}_/.test(name))
    .sort();
  if (JSON.stringify(migrations) !== JSON.stringify(reviewed))
    throw new Error('Migration não revisada.');
  const checksums = migrations.map((migration) =>
    createHash('sha256')
      .update(readFileSync(new URL(`${migration}/migration.sql`, directory)))
      .digest('hex'),
  );
  if (
    checksums[0] !==
    'c8edf2262a591804c4d8f3f66b07479039c71f209e5b5dd9fe5c0ce1022a6e17'
  )
    throw new Error('Migration publicada alterada.');

  async function inspect() {
    const db = new pg.Client({
      connectionString: target.connectionString,
      connectionTimeoutMillis: 5000,
      options: '-c default_transaction_read_only=on',
    });
    try {
      await db.connect();
      if (
        (await db.query('SELECT current_database() AS name')).rows[0]?.name !==
        target.database
      )
        throw new Error('Banco efetivo inesperado.');
      const schemas = await db.query(
        "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname NOT IN ('public','information_schema')",
      );
      if (schemas.rowCount)
        throw new Error('Schema desconhecido: operação recusada.');
      const relations = await db.query(
        "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'",
      );
      const tables = (
        await db.query<{ name: string }>(
          "SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
        )
      ).rows.map((r) => r.name);
      if (!relations.rowCount) {
        const objects = await db.query(
          "SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') + (SELECT count(*) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS count",
        );
        if (Number(objects.rows[0]?.count))
          throw new Error('Objetos preexistentes: operação recusada.');
        return 0;
      }
      if (!tables.includes('_prisma_migrations'))
        throw new Error('Histórico ausente.');
      const rows = await db.query(
        'SELECT migration_name, checksum, finished_at, rolled_back_at FROM public._prisma_migrations ORDER BY migration_name',
      );
      const count = rows.rows.length;
      if (
        count > migrations.length ||
        !count ||
        rows.rows.some(
          (row, i) =>
            row.migration_name !== migrations[i] ||
            row.checksum !== checksums[i] ||
            !row.finished_at ||
            row.rolled_back_at,
        )
      )
        throw new Error('Histórico divergente ou incompleto.');
      const expectedTables = [
        ...coreTables,
        ...(count >= 2 ? ['auth_sessions', 'auth_refresh_tokens'] : []),
      ].sort();
      if (JSON.stringify(tables) !== JSON.stringify(expectedTables))
        throw new Error('Objetos inesperados.');
      return count;
    } finally {
      await db.end();
    }
  }

  const applied = await inspect();
  if (applied < migrations.length) {
    const require = createRequire(import.meta.url);
    // No credentials in command-line arguments or output; failure is not retried.
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: fileURLToPath(new URL('../', import.meta.url)),
        env: { ...process.env, DATABASE_URL: target.connectionString },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    if ((await inspect()) !== migrations.length)
      throw new Error('Aplicação não confirmada.');
  }
  console.log({
    database: target.database,
    migrations,
    state:
      applied === migrations.length
        ? 'já aplicada, checksum confirmado'
        : 'aplicada e verificada',
    migrationsVerified: migrations.length,
  });
}

try {
  await migrate();
} catch {
  console.error(
    'Migration interrompida: pré-condição, histórico ou execução falhou. Sem reset, resolve ou nova tentativa automática; detalhes sensíveis omitidos.',
  );
  process.exitCode = 1;
}
