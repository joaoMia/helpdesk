import { defineConfig } from 'prisma/config';
import { loadEnvironment } from './src/config/env.js';

const config = loadEnvironment();
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: config.DATABASE_URL ? { url: config.DATABASE_URL } : undefined,
});
