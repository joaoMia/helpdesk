import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { ProjectWorkflowService } from './project-workflow.service.js';
export function workflowController(
  auth: AuthRuntime,
  s: ProjectWorkflowService,
) {
  const identity = (req: Parameters<RequestHandler>[0]) =>
    auth.http.identity(req);
  const list: RequestHandler = async (req, res) => {
    res.json(await s.list(identity(req), req.query));
  };
  const dashboard: RequestHandler = async (req, res) => {
    res.json(await s.dashboard(identity(req), req.query));
  };
  const read: RequestHandler = async (req, res) => {
    res.json(await s.read(identity(req), req.params.id, req.query));
  };
  const history =
    (updates = false): RequestHandler =>
    async (req, res) => {
      res.json(
        await s.history(identity(req), req.params.id, req.query, updates),
      );
    };
  const versions: RequestHandler = async (req, res) => {
    res.json(await s.versions(identity(req), req.params.id, req.query));
  };
  const version: RequestHandler = async (req, res) => {
    res.json(
      await s.version(
        identity(req),
        req.params.id,
        req.params.version,
        req.query,
      ),
    );
  };
  const write =
    (op: string): RequestHandler =>
    async (req, res) => {
      res.json(
        await s.write(
          identity(req),
          req.params.id,
          op,
          req.body,
          req.query,
          req.params.activityId ?? req.params.stageId,
        ),
      );
    };
  return { list, dashboard, read, history, versions, version, write };
}
