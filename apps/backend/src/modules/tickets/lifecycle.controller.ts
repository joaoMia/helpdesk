import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { LifecycleService } from './lifecycle.service.js';
import { ApplicationError } from '../../shared/errors.js';
export function lifecycleController(auth: AuthRuntime, s: LifecycleService) {
  const identity = (req: Parameters<RequestHandler>[0]) =>
    auth.http.identity(req);
  const clean = (req: Parameters<RequestHandler>[0]) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não são permitidos.',
      );
  };
  const metrics: RequestHandler = async (req, res) =>
    res.json(await s.metrics(identity(req), req.params.id, req.query));
  const reasons: RequestHandler = async (req, res) =>
    res.json(await s.reasons(identity(req), req.query));
  const policies: RequestHandler = async (req, res) =>
    res.json(await s.policies(identity(req), req.query));
  const dashboard: RequestHandler = async (req, res) =>
    res.json(await s.dashboard(identity(req), req.query));
  const reason: RequestHandler = async (req, res) => {
    clean(req);
    res
      .status(req.params.id ? 200 : 201)
      .json(await s.saveReason(identity(req), req.params.id, req.body));
  };
  const policy: RequestHandler = async (req, res) => {
    clean(req);
    res.status(201).json(await s.savePolicy(identity(req), req.body));
  };
  const transition =
    (op: 'pause' | 'resume' | 'close'): RequestHandler =>
    async (req, res) => {
      clean(req);
      res.json({
        ticket: await s.transition(identity(req), req.params.id, op, req.body),
      });
    };
  return { metrics, reasons, policies, dashboard, reason, policy, transition };
}
