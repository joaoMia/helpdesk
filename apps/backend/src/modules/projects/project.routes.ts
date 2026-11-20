import { workflowController } from './project-workflow.controller.js';
import { ProjectCatalogRepository } from './project-catalog.repository.js';
import { ProjectCatalogService } from './project-catalog.service.js';
import { projectCatalogController } from './project-catalog.controller.js';
import { ProjectWorkflowService } from './project-workflow.service.js';
import { ProjectWorkflowRepository } from './project-workflow.repository.js';
import { Router, raw } from 'express';
import { ProjectFileService } from './project-file.service.js';
import { ProjectFileRepository } from './project-file.repository.js';
import { projectFileController } from './project-file.controller.js';
import { ProjectConversationRepository } from './project-conversation.repository.js';
import { ProjectConversationService } from './project-conversation.service.js';
import { projectConversationController } from './project-conversation.controller.js';
import { projectConversationStream } from './project-conversation-stream.js';
import { rateLimit } from 'express-rate-limit';
import type { AuthRuntime } from '../auth/auth.routes.js';
import { authorization } from '../authorization/http.js';
import { ApplicationError } from '../../shared/errors.js';
import { projectController } from './project.controller.js';
import type { ProjectService } from './project.service.js';
export function projectRoutes(auth: AuthRuntime, service: ProjectService) {
  const router = Router(),
    guard = authorization(auth),
    c = projectController(auth, service);
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const catalog = projectCatalogController(
    auth,
    new ProjectCatalogService(new ProjectCatalogRepository(service.repo.db)),
  );
  const files = projectFileController(
    auth,
    new ProjectFileService(
      new ProjectFileRepository(service.repo.db),
      service.repo.attachments,
    ),
  );
  const conversationService = new ProjectConversationService(
      new ProjectConversationRepository(service.repo.db),
      service.repo.attachments,
    ),
    conversation = projectConversationController(auth, conversationService);
  router.get(
    '/:id/conversation/stream',
    ...guard.permission('projects.conversation'),
    projectConversationStream(auth, conversationService),
  );
  router.get(
    '/:id/conversation',
    ...guard.permission('projects.conversation'),
    conversation.read,
  );
  router.post(
    '/:id/conversation/messages',
    ...guard.permission('projects.conversation'),
    conversation.send,
  );
  router.post(
    '/:id/conversation/attachments',
    ...guard.permission('projects.conversation'),
    rateLimit({
      windowMs: 60000,
      limit: 20,
      keyGenerator: (req) => req.identity!.user.id,
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
          'Envie arquivo binário sem compressão.',
        );
      next();
    },
    raw({
      type: 'application/octet-stream',
      inflate: false,
      limit: conversationService.limits.bytes,
    }),
    conversation.upload,
  );
  router.delete(
    '/:id/conversation/attachments/:fileId/draft',
    ...guard.permission('projects.conversation'),
    conversation.discard,
  );
  router.get(
    '/:id/conversation/attachments/:fileId',
    ...guard.permission('projects.conversation'),
    conversation.download,
  );
  router.post(
    '/opening-uploads',
    ...guard.permission('projects.request'),
    rateLimit({
      windowMs: 60000,
      limit: 20,
      keyGenerator: (req) => req.identity!.user.id,
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
      limit: 10 * 1024 * 1024,
    }),
    files.upload,
  );
  router.delete(
    '/opening-uploads/:fileId',
    ...guard.permission('projects.request'),
    files.discard,
  );
  router.get(
    '/:id/attachments',
    ...guard.permission('projects.workflow-read'),
    files.list,
  );
  router.get(
    '/:id/attachments/:fileId',
    ...guard.permission('projects.workflow-read'),
    files.download,
  );
  router.get(
    '/categories',
    ...guard.permission('projects.workflow-read'),
    catalog('list'),
  );
  router.post(
    '/categories',
    ...guard.permission('projects.assign'),
    catalog('create'),
  );
  router.post(
    '/categories/bootstrap',
    ...guard.permission('projects.assign'),
    catalog('bootstrap'),
  );
  router.patch(
    '/categories/:id',
    ...guard.permission('projects.assign'),
    catalog('change'),
  );
  router.get(
    '/categories/:id/form',
    ...guard.permission('projects.workflow-read'),
    catalog('form'),
  );
  router.patch(
    '/categories/:id/form/draft',
    ...guard.permission('projects.assign'),
    catalog('save'),
  );
  router.post(
    '/categories/:id/form/publish',
    ...guard.permission('projects.assign'),
    catalog('publish'),
  );
  router.get(
    '/:id/submission',
    ...guard.permission('projects.workflow-read'),
    catalog('submission'),
  );
  const w = workflowController(
    auth,
    new ProjectWorkflowService(new ProjectWorkflowRepository(service.repo.db)),
  );
  router.get(
    '/workflows/dashboard',
    ...guard.permission('projects.workflow-read'),
    w.dashboard,
  );
  router.get(
    '/workflows',
    ...guard.permission('projects.workflow-read'),
    w.list,
  );
  router.get(
    '/:id/workflow',
    ...guard.permission('projects.workflow-read'),
    w.read,
  );
  router.get(
    '/:id/workflow/history',
    ...guard.permission('projects.workflow-read'),
    w.history(),
  );
  router.get(
    '/:id/updates',
    ...guard.permission('projects.workflow-read'),
    w.history(true),
  );
  router.get(
    '/:id/plan-versions',
    ...guard.permission('projects.workflow-read'),
    w.versions,
  );
  router.get(
    '/:id/plan-versions/:version',
    ...guard.permission('projects.workflow-read'),
    w.version,
  );
  router.get('/:id/plan-draft', ...guard.permission('projects.plan'), w.read);
  router.put(
    '/:id/plan-draft',
    ...guard.permission('projects.plan'),
    w.write('draft'),
  );
  router.delete(
    '/:id/plan-draft',
    ...guard.permission('projects.plan'),
    w.write('draft-delete'),
  );
  router.patch(
    '/:id/activities/:activityId',
    ...guard.permission('projects.transition'),
    w.write('activity'),
  );
  router.post(
    '/:id/stages/:stageId/complete',
    ...guard.permission('projects.transition'),
    w.write('stage-complete'),
  );
  for (const [route, op, permission] of [
    ['retire', 'retire', 'projects.retire'],
    ['assignment', 'assignment', 'projects.assign'],
    ['priority', 'priority', 'projects.plan'],
    ['plan-publication', 'publish', 'projects.plan'],
    ['start', 'start', 'projects.transition'],
    ['complete', 'complete', 'projects.transition'],
    ['cancel', 'cancel', 'projects.cancel'],
  ] as const)
    router.post('/:id/' + route, ...guard.permission(permission), w.write(op));
  router.get('/', ...guard.permission('projects.read'), c.list);
  router.get('/:id/history', ...guard.permission('projects.read'), c.history);
  router.get('/:id', ...guard.permission('projects.read'), c.detail);
  router.post(
    '/',
    ...guard.permission('projects.request'),
    rateLimit({
      windowMs: 60000,
      limit: 20,
      keyGenerator: (req) => req.identity!.user.id,
      handler: (_req, _res, next) =>
        next(
          new ApplicationError(
            'TOO_MANY_ATTEMPTS',
            429,
            'Aguarde antes de enviar outra solicitação.',
          ),
        ),
    }),
    c.create,
  );
  return router;
}
