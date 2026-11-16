import { Router } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import { authorization } from '../authorization/http.js';
import type { LifecycleService } from './lifecycle.service.js';
import { lifecycleController } from './lifecycle.controller.js';
export function lifecycleRoutes(auth: AuthRuntime, service: LifecycleService) {
  const r = Router(),
    g = authorization(auth),
    c = lifecycleController(auth, service);
  r.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  r.get(
    '/dashboard/me',
    ...g.permission('dashboard.personal'),
    async (req, res) =>
      res.json(
        await service.personalDashboard(auth.http.identity(req), req.query),
      ),
  );
  r.get('/tickets/:id/metrics', ...g.permission('tickets.read'), c.metrics);
  r.post(
    '/tickets/:id/pending',
    ...g.permission('tickets.pause'),
    c.transition('pause'),
  );
  r.post(
    '/tickets/:id/resume',
    ...g.permission('tickets.resume'),
    c.transition('resume'),
  );
  r.post(
    '/tickets/:id/close',
    ...g.permission('tickets.close'),
    c.transition('close'),
  );
  r.get('/pending-reasons', ...g.permission('pending-reasons.read'), c.reasons);
  r.post(
    '/admin/pending-reasons',
    ...g.permission('administration.manage'),
    c.reason,
  );
  r.patch(
    '/admin/pending-reasons/:id',
    ...g.permission('administration.manage'),
    c.reason,
  );
  r.get(
    '/admin/sla-policies',
    ...g.permission('administration.manage'),
    c.policies,
  );
  r.post(
    '/admin/sla-policies',
    ...g.permission('administration.manage'),
    c.policy,
  );
  r.get('/admin/dashboard', ...g.permission('dashboard.read'), c.dashboard);
  return r;
}
