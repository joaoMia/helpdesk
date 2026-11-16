import { openingUploadController } from './opening-upload.controller.js';
import { Router, raw } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { AuthRuntime } from '../auth/auth.routes.js';
import { authorization } from '../authorization/http.js';
import type { OpeningUploadService } from './opening-upload.service.js';
import { ApplicationError } from '../../shared/errors.js';
export function openingUploadRoutes(
  auth: AuthRuntime,
  service: OpeningUploadService,
) {
  const r = Router(),
    g = authorization(auth),
    c = openingUploadController(auth, service);
  r.post(
    '/opening-uploads',
    ...g.permission('tickets.create'),
    rateLimit({
      windowMs: 60000,
      limit: 20,
      keyGenerator: (req) => req.identity!.user.id,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
    (req, _res, next) => {
      if (
        req.get('Content-Encoding') ||
        req.get('Content-Type')?.split(';')[0] !== 'application/octet-stream'
      )
        throw new ApplicationError(
          'INVALID_FILE',
          415,
          'Envie arquivo binário sem compressão.',
        );
      next();
    },
    raw({
      type: 'application/octet-stream',
      inflate: false,
      limit: service.limits.bytes,
    }),
    c.upload,
  );
  r.delete(
    '/opening-uploads/:id',
    ...g.permission('tickets.create'),
    c.discard,
  );
  return r;
}
