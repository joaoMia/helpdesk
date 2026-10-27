import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';
import { loadEnvironment } from '../../src/config/env.js';
import { isolatedTestTarget } from '../../src/database/test-target.js';
import { createDatabase } from '../../src/database/client.js';

// Dedicated disposable namespace in helpdesk_test allows independent connections
// and real concurrent transactions. Never uses/recreates public or development.
export async function authTestDatabase() {
  const target = isolatedTestTarget(loadEnvironment(), process.env.NODE_ENV);
  const schema = 'dev003_' + randomUUID().replaceAll('-', '');
  if (!/^dev003_[a-f0-9]{32}$/.test(schema))
    throw new Error('Namespace inválido.');
  const control = new pg.Client({ connectionString: target.connectionString });
  await control.connect();
  if (
    (await control.query('SELECT current_database() AS name')).rows[0]?.name !==
    'helpdesk_test'
  ) {
    await control.end();
    throw new Error('Teste recusado fora de helpdesk_test.');
  }
  try {
    await control.query('BEGIN');
    await control.query(`CREATE SCHEMA "${schema}"`);
    await control.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    const dir = new URL('../../prisma/migrations/', import.meta.url);
    for (const name of readdirSync(dir)
      .filter((name) => /^\d{14}_/.test(name))
      .sort()) {
      const statements = readFileSync(
        new URL(`${name}/migration.sql`, dir),
        'utf8',
      ).split(/^-- statement-breakpoint\s*$/m);
      for (const sql of statements) {
        const command = sql.replace(/--[^\n]*/g, '').trim();
        if (command && !/^(BEGIN|COMMIT);$/i.test(command))
          await control.query(sql.replaceAll('"public"', `"${schema}"`));
      }
    }
    await control.query('COMMIT');
  } catch (error) {
    await control.query('ROLLBACK');
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
