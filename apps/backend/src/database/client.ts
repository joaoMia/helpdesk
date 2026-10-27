import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createDatabase(connectionString: string, schema = 'public') {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema))
    throw new Error('Schema de banco inválido.');
  const adapter = new PrismaPg(
    {
      connectionString,
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      options: `-c search_path=${schema},pg_catalog`,
    },
    { schema },
  );
  // The adapter owns its pool. Never log the connection configuration.
  return new PrismaClient({ adapter, errorFormat: 'minimal' });
}
