import { describe, expect, it } from '@jest/globals';
import { randomBytes } from 'node:crypto';
import { authConfig } from '../src/modules/auth/auth.config.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
} from '@helpdesk/contracts';
describe('contratos e configuração segura de autenticação', () => {
  const input = {
    AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
    AUTH_CSRF_SECRET: randomBytes(32).toString('base64url'),
    AUTH_ORIGINS: 'http://127.0.0.1:5173',
    AUTH_COOKIE_SECURE: 'false',
    AUTH_ALLOW_LOCAL_HTTP: 'true',
  };
  it('recusa configuração HTTP fora do desenvolvimento local e chaves ausentes/iguais', () => {
    expect(authConfig(input, 'development').accessSeconds).toBe(900);
    expect(authConfig(input, 'development').refreshSeconds).toBe(604800);
    expect(() => authConfig(input, 'production')).toThrow();
    expect(() =>
      authConfig(
        { ...input, AUTH_ORIGINS: 'http://example.invalid' },
        'development',
      ),
    ).toThrow();
    expect(() =>
      authConfig({ ...input, AUTH_ALLOW_LOCAL_HTTP: 'false' }, 'development'),
    ).toThrow();
    expect(() =>
      authConfig(
        { ...input, AUTH_CSRF_SECRET: input.AUTH_JWT_SECRET },
        'development',
      ),
    ).toThrow();
    expect(() => authConfig({}, 'production')).toThrow();
    expect(
      authConfig(
        {
          ...input,
          AUTH_ORIGINS: 'https://helpdesk.example.invalid',
          AUTH_COOKIE_SECURE: 'true',
          AUTH_ALLOW_LOCAL_HTTP: 'false',
        },
        'production',
      ).secure,
    ).toBe(true);
  });
  it('normaliza somente e-mail/nome e preserva espaços da senha sem permitir perfil escolhido', () => {
    const password = ' ' + randomBytes(12).toString('base64url') + ' ';
    const parsed = registerSchema.parse({
      name: ' Teste ',
      email: ' PESSOA@EXAMPLE.INVALID ',
      password,
    });
    expect(parsed.email).toBe('pessoa@example.invalid');
    expect(parsed.password).toBe(password);
    expect(registerSchema.safeParse({ ...parsed, role: 'ADMIN' }).success).toBe(
      false,
    );
    expect(loginSchema.safeParse({ ...parsed }).success).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        currentPassword: 'x',
        newPassword: 'curta',
      }).success,
    ).toBe(false);
  });
});
