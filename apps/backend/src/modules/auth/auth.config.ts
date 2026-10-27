import { z } from 'zod';
import { loadEnvironment } from '../../config/env.js';

const schema = z.object({
  AUTH_JWT_SECRET: z.string().regex(/^[A-Za-z0-9_-]{43,}$/),
  AUTH_CSRF_SECRET: z.string().regex(/^[A-Za-z0-9_-]{43,}$/),
  AUTH_ORIGINS: z.string().min(1),
  AUTH_COOKIE_SECURE: z.enum(['true', 'false']).default('true'),
  AUTH_ALLOW_LOCAL_HTTP: z.enum(['true', 'false']).default('false'),
});
export function authConfig(input: Record<string, unknown>, mode: string) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      'Configuração AUTH_* ausente ou inválida; execute npm run auth:env:setup no ambiente local.',
    );
  const v = result.data;
  const origins = v.AUTH_ORIGINS.split(',').map((origin) => origin.trim());
  const local = (url: URL) =>
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  let valid = true;
  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (origin !== url.origin || !['http:', 'https:'].includes(url.protocol))
        valid = false;
      if (mode === 'production' && url.protocol !== 'https:') valid = false;
      if (v.AUTH_COOKIE_SECURE === 'false' && !local(url)) valid = false;
    } catch {
      valid = false;
    }
  }
  if (
    !valid ||
    v.AUTH_JWT_SECRET === v.AUTH_CSRF_SECRET ||
    Buffer.from(v.AUTH_JWT_SECRET, 'base64url').length < 32 ||
    Buffer.from(v.AUTH_CSRF_SECRET, 'base64url').length < 32 ||
    (v.AUTH_COOKIE_SECURE === 'false' &&
      (mode === 'production' || v.AUTH_ALLOW_LOCAL_HTTP !== 'true'))
  )
    throw new Error(
      'Configuração de origens, chaves ou cookies AUTH_* insegura; valores omitidos.',
    );
  return {
    jwtKey: Buffer.from(v.AUTH_JWT_SECRET, 'base64url'),
    csrfSecret: v.AUTH_CSRF_SECRET,
    origins,
    secure: v.AUTH_COOKIE_SECURE === 'true',
    issuer: 'helpdesk-api',
    audience: 'helpdesk-web',
    accessSeconds: 900,
    refreshSeconds: 7 * 24 * 60 * 60,
  };
}
export type AuthConfig = ReturnType<typeof authConfig>;
export function loadAuthConfig() {
  const env = loadEnvironment();
  return authConfig(env, env.NODE_ENV);
}
