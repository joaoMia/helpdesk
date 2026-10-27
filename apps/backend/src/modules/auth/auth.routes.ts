import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { ApplicationError } from '../../shared/errors.js';
import type { AuthService } from './auth.service.js';
import { authHttp } from './auth.http.js';
import { authController } from './auth.controller.js';

export function authRuntime(service: AuthService) {
  const http = authHttp(service.config, service);
  const controller = authController(service, http);
  const router = Router();
  const limit = (max: number, windowMs: number, account = false) =>
    rateLimit({
      windowMs,
      limit: max,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      ...(account
        ? {
            keyGenerator: (req) =>
              createHash('sha256')
                .update(
                  typeof req.body?.email === 'string'
                    ? req.body.email.trim().toLowerCase()
                    : 'invalid',
                )
                .digest('hex'),
          }
        : {}),
      handler: (_req, _res, next) =>
        next(
          new ApplicationError(
            'TOO_MANY_ATTEMPTS',
            429,
            'Muitas tentativas. Aguarde antes de tentar novamente.',
          ),
        ),
    });
  router.use(http.origin, http.corsPolicy, http.protect);
  router.get('/csrf', limit(120, 60000), http.csrfToken);
  router.post('/register', limit(5, 15 * 60000), controller.register);
  router.post(
    '/login',
    limit(10, 15 * 60000),
    limit(20, 15 * 60000, true),
    controller.login,
  );
  router.post('/refresh', limit(60, 60000), controller.refresh);
  router.post('/logout', controller.logout);
  router.get('/me', http.authenticate(true), controller.me);
  router.patch(
    '/change-password',
    limit(5, 15 * 60000),
    http.authenticate(true),
    controller.changePassword,
  );
  return { router, http, service };
}
export type AuthRuntime = ReturnType<typeof authRuntime>;
