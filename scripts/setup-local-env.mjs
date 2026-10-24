import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const target = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(target)) {
  console.log('.env já existe; conteúdo preservado.');
} else {
  const password = randomBytes(32).toString('hex');
  const connection = `postgresql://helpdesk_app:${password}@127.0.0.1:5432`;
  writeFileSync(
    target,
    [
      'POSTGRES_USER=helpdesk_app',
      `POSTGRES_PASSWORD=${password}`,
      'POSTGRES_DB=helpdesk_dev',
      'POSTGRES_TEST_DB=helpdesk_test',
      'POSTGRES_PORT=5432',
      `DATABASE_URL=${connection}/helpdesk_dev`,
      `TEST_DATABASE_URL=${connection}/helpdesk_test`,
      'HOST=127.0.0.1',
      'PORT=3001',
      'NODE_ENV=development',
      '',
    ].join('\n'),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    '.env local criado com credencial aleatória; valores não exibidos.',
  );
}
