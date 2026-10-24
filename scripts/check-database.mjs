import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import pg from 'pg';

const config = {
  ...parseEnv(readFileSync(new URL('../.env', import.meta.url), 'utf8')),
  ...process.env,
};

if (
  !config.DATABASE_URL ||
  !config.TEST_DATABASE_URL ||
  config.DATABASE_URL === config.TEST_DATABASE_URL
) {
  console.error('Configure conexões distintas para desenvolvimento e testes.');
  process.exitCode = 1;
} else {
  for (const [label, connectionString] of [
    ['desenvolvimento', config.DATABASE_URL],
    ['testes', config.TEST_DATABASE_URL],
  ]) {
    const client = new pg.Client({
      connectionString,
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      const result = await client.query(
        "SELECT current_database() AS database, current_setting('server_version') AS version, (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables",
      );
      console.log({ ambiente: label, ...result.rows[0] });
    } catch {
      console.error(
        `Falha de conexão ao banco de ${label}; credenciais omitidas.`,
      );
      process.exitCode = 1;
    } finally {
      await client.end();
    }
  }
}
