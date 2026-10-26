import { loadEnvironment } from '../src/config/env.js';
import { createDatabase } from '../src/database/client.js';
import { isolatedTestTarget } from '../src/database/test-target.js';
const config = loadEnvironment();
isolatedTestTarget(config, 'test');
for (const [label, url] of [
  ['desenvolvimento', config.DATABASE_URL],
  ['testes', config.TEST_DATABASE_URL],
] as const) {
  const db = createDatabase(url!);
  try {
    const rows = await db.$queryRaw<
      { database: string; version: string; tables: number }[]
    >`SELECT current_database() AS database, current_setting('server_version') AS version, (SELECT count(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables`;
    console.log({ ambiente: label, ...rows[0] });
  } catch {
    console.error(
      `Falha de conexão Prisma em ${label}; detalhes sensíveis omitidos.`,
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
