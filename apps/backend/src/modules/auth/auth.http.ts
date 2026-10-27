import { randomBytes } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { doubleCsrf } from 'csrf-csrf';
import { parseCookie } from 'cookie';
import cors from 'cors';
import { ApplicationError } from '../../shared/errors.js';
import type { AuthConfig } from './auth.config.js';
import { AuthService, invalidSession } from './auth.service.js';
import type { Identity } from './auth.service.js';

declare module 'express-serve-static-core' {
  interface Request {
    identity?: Identity;
    authCsrfContext?: string;
  }
}
export function cookieNames(secure: boolean) {
  const prefix = secure ? '__Host-helpdesk.' : 'helpdesk.';
  return {
    access: prefix + 'access',
    refresh: prefix + 'refresh',
    csrf: prefix + 'csrf',
    context: prefix + 'context',
  };
}
export function authHttp(config: AuthConfig, service: AuthService) {
  const names = cookieNames(config.secure);
  const options = {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: config.secure,
    path: '/',
  };
  const read = (req: Request, name: string): string | undefined => {
    const value: unknown = req.cookies?.[name];
    return typeof value === 'string' ? value : undefined;
  };
  const refreshIdentity = (req: Request) => {
    const token = read(req, names.refresh);
    return token && /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token)
      ? token.slice(0, 36)
      : undefined;
  };
  const contextIdentity = (req: Request) => {
    const context = req.authCsrfContext ?? read(req, names.context);
    return context && /^[A-Za-z0-9_-]{43}$/.test(context) ? context : undefined;
  };
  const csrf = doubleCsrf({
    getSecret: () => config.csrfSecret,
    getSessionIdentifier: (req) => {
      return refreshIdentity(req) ?? contextIdentity(req) ?? '';
    },
    cookieName: names.csrf,
    cookieOptions: { ...options, maxAge: 3600000 },
    getCsrfTokenFromRequest: (req) => req.get('X-CSRF-Token'),
  });
  const origin: RequestHandler = (req, res, next) => {
    if (!config.secure && req.secure)
      return next(
        new ApplicationError(
          'HTTPS_CONFIG_REQUIRED',
          403,
          'Configure cookies Secure para utilizar HTTPS.',
        ),
      );
    const supplied = req.get('Origin');
    if (
      (supplied && !config.origins.includes(supplied)) ||
      (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !supplied)
    )
      return next(
        new ApplicationError('ORIGIN_FORBIDDEN', 403, 'Origem não autorizada.'),
      );
    if (
      !config.secure &&
      !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
        req.socket.remoteAddress ?? '',
      )
    )
      return next(
        new ApplicationError(
          'HTTPS_REQUIRED',
          403,
          'HTTP permitido somente no desenvolvimento local.',
        ),
      );
    if (config.secure && !req.secure)
      return next(
        new ApplicationError(
          'HTTPS_REQUIRED',
          403,
          'HTTPS obrigatório para autenticação.',
        ),
      );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    req.cookies = parseCookie(req.headers.cookie ?? '');
    next();
  };
  const corsPolicy = cors({
    origin: config.origins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
    maxAge: 600,
  });
  const protect: RequestHandler = (req, res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !refreshIdentity(req) &&
      !contextIdentity(req)
    )
      return next(
        new ApplicationError(
          'CSRF_INVALID',
          403,
          'Proteção CSRF inválida. Atualize a página e tente novamente.',
        ),
      );
    csrf.doubleCsrfProtection(req, res, (error?: unknown) =>
      next(
        error
          ? new ApplicationError(
              'CSRF_INVALID',
              403,
              'Proteção CSRF inválida. Atualize a página e tente novamente.',
            )
          : undefined,
      ),
    );
  };
  const csrfToken: RequestHandler = (req, res) => {
    if (!refreshIdentity(req) && !contextIdentity(req)) {
      req.authCsrfContext = randomBytes(32).toString('base64url');
      res.cookie(names.context, req.authCsrfContext, {
        ...options,
        maxAge: 3600000,
      });
    }
    res.json({
      csrfToken: csrf.generateCsrfToken(req, res, { overwrite: false }),
    });
  };
  function clear(res: Response) {
    for (const name of Object.values(names)) res.clearCookie(name, options);
  }
  function issue(
    res: Response,
    tokens: Awaited<ReturnType<AuthService['login']>>,
    login: boolean,
  ) {
    res.cookie(names.access, tokens.accessToken, {
      ...options,
      maxAge: config.accessSeconds * 1000,
    });
    res.cookie(names.refresh, tokens.refreshToken, {
      ...options,
      maxAge: Math.max(0, tokens.expiresAt.getTime() - Date.now()),
    });
    if (login) {
      res.clearCookie(names.csrf, options);
      res.clearCookie(names.context, options);
    }
  }
  function authenticate(allowPasswordChange = false): RequestHandler {
    return async (req, _res, next) => {
      try {
        req.identity = await service.authenticate(read(req, names.access));
        if (req.identity.user.mustChangePassword && !allowPasswordChange)
          throw new ApplicationError(
            'PASSWORD_CHANGE_REQUIRED',
            403,
            'Troque a senha inicial antes de acessar outras funcionalidades.',
          );
        next();
      } catch (error) {
        next(error);
      }
    };
  }
  function identity(req: Request) {
    if (!req.identity) throw invalidSession();
    return req.identity;
  }
  return {
    names,
    origin,
    corsPolicy,
    protect,
    csrfToken,
    clear,
    issue,
    authenticate,
    identity,
    read,
  };
}
