import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { loadEnvironment } from '../../src/config/env.js';
import { isolatedTestTarget } from '../../src/database/test-target.js';
import { createDatabase } from '../../src/database/client.js';
import { readTestMigrationStatements } from './migration-statements.js';

let migrations: string[] | undefined;

// Dedicated disposable namespace in helpdesk_test allows independent connections
// and real concurrent transactions. Never uses/recreates public or development.
export async function authTestDatabase() {
  const target = isolatedTestTarget(loadEnvironment(), process.env.NODE_ENV);
  const schema = 'dev003_' + randomUUID().replaceAll('-', '');
  if (!/^dev003_[a-f0-9]{32}$/.test(schema))
    throw new Error('Namespace inválido.');
  const control = new pg.Client({
    connectionString: target.connectionString,
    connectionTimeoutMillis: 5000,
    query_timeout: 20000,
  });
  try {
    await control.connect();
    const identity = await control.query('SELECT current_database() AS name');
    if (identity.rows[0]?.name !== target.database) {
      throw new Error('Teste recusado fora de helpdesk_test.');
    }
    migrations ??= readTestMigrationStatements();
    // Run the migration script as one request and one transaction. If setup
    // times out, closing the client aborts the uncommitted work.
    await control.query(
      [
        'BEGIN;',
        `CREATE SCHEMA "${schema}";`,
        `SET LOCAL search_path TO "${schema}", pg_catalog;`,
        ...migrations.map((sql) => sql.replaceAll('"public"', `"${schema}"`)),
        'COMMIT;',
      ].join('\n'),
    );
  } catch (error) {
    // Ending the session also rolls back any uncommitted fixture DDL.
    await control.end();
    throw error;
  }
  const db = createDatabase(target.connectionString, schema);
  return {
    db,
    schema,
    async dispose() {
      try {
        await db.$disconnect();
        // Explicit retention for isolated validation runs that must avoid DROP SCHEMA.
        if (process.env.HELPDESK_TEST_KEEP_SCHEMA === '1') return;
        const owner = await control.query(
          'SELECT nspname FROM pg_namespace WHERE nspname=$1 AND nspowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)',
          [schema],
        );
        if (owner.rowCount !== 1 || !/^dev003_[a-f0-9]{32}$/.test(schema))
          throw new Error('Limpeza recusada: namespace não pertence ao teste.');
        // Only this newly-created, uniquely-named test namespace. No existing data.
        await control.query(`DROP SCHEMA "${schema}" CASCADE`);
        if (
          (
            await control.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [
              schema,
            ])
          ).rowCount
        )
          throw new Error('Namespace de teste remanescente.');
      } finally {
        await control.end();
      }
    },
  };
}
