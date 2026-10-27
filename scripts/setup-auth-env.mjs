import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
const file = new URL('../.env', import.meta.url);
if (!existsSync(file)) throw new Error('Execute npm run env:setup primeiro.');
const existing = parseEnv(readFileSync(file, 'utf8'));
const values = {
  AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
  AUTH_CSRF_SECRET: randomBytes(32).toString('base64url'),
  AUTH_ORIGINS: 'http://127.0.0.1:5173,http://localhost:5173',
  AUTH_COOKIE_SECURE: 'false',
  AUTH_ALLOW_LOCAL_HTTP: 'true',
};
if (existing.NODE_ENV === 'production')
  throw new Error('Setup recusado em produção.');
const missing = Object.entries(values).filter(([key]) => !(key in existing));
if (missing.length)
  appendFileSync(
    file,
    '\n# Autenticação local DEV-003; valores não versionados.\n' +
      missing.map(([key, value]) => `${key}=${value}`).join('\n') +
      '\n',
  );
console.log({
  addedAuthKeys: missing.length,
  existingValuesPreserved: true,
  secretsDisplayed: false,
});
