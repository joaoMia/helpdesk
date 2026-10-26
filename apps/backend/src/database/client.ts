import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createDatabase(connectionString: string, schema = 'public') {
  const adapter = new PrismaPg(
    {
      connectionString,
      max: 4,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    },
    { schema },
  );
  // The adapter owns its pool. Never log the connection configuration.
  return new PrismaClient({ adapter, errorFormat: 'minimal' });
}
