import { Router, raw } from 'express';
import { conversationStream } from './conversation-stream.js';
import { rateLimit } from 'express-rate-limit';
import type { AuthRuntime } from '../auth/auth.routes.js';
import { authorization } from '../authorization/http.js';
import type { ConversationService } from './conversation.service.js';
import { conversationController } from './conversation.controller.js';
import { ApplicationError } from '../../shared/errors.js';
export function conversationRoutes(
  auth: AuthRuntime,
  service: ConversationService,
) {
  const r = Router(),
    g = authorization(auth),
    c = conversationController(auth, service);
  r.get(
    '/:id/conversation/stream',
    ...g.permission('tickets.read'),
    conversationStream(auth, service),
  );
  r.delete(
    '/:id/attachments/:fileId/draft',
    ...g.permission('tickets.comment'),
    c.discard,
  );
  r.get('/:id/conversation', ...g.permission('tickets.read'), c.read);
  r.post('/:id/comments', ...g.permission('tickets.comment'), c.comment);
  r.post('/:id/solution', ...g.permission('tickets.solve'), c.solve);
  r.get(
    '/:id/attachments/:fileId',
    ...g.permission('tickets.read'),
    c.download,
  );
  r.post(
    '/:id/attachments',
    ...g.permission('tickets.comment'),
    rateLimit({
      windowMs: 60000,
      limit: 20,
      keyGenerator: (req) => req.identity!.user.id,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, _res, next) =>
        next(
          new ApplicationError(
            'TOO_MANY_ATTEMPTS',
            429,
            'Muitos envios. Aguarde antes de tentar novamente.',
          ),
        ),
    }),
    (req, _res, next) => {
      if (
        req.get('Content-Encoding') ||
        req.get('Content-Type')?.split(';')[0] !== 'application/octet-stream'
      )
        throw new ApplicationError(
          'INVALID_FILE',
          415,
          'Envie o arquivo binário sem compressão de transporte.',
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
  return r;
}
