import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: z.url().optional(),
  TEST_DATABASE_URL: z.url().optional(),
});

export function parseEnvironment(input: Record<string, string | undefined>) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(`Configuração de ambiente inválida: ${fields.join(', ')}.`);
  }
  return result.data;
}

export function loadEnvironment() {
  // O mesmo caminho relativo funciona em src/config e dist/config.
  const envFile = new URL('../../../../.env', import.meta.url);
  const local = existsSync(envFile)
    ? parseEnv(readFileSync(envFile, 'utf8'))
    : {};
  return parseEnvironment({ ...local, ...process.env });
}
