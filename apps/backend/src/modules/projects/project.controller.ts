import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { ProjectService } from './project.service.js';
export function projectController(auth: AuthRuntime, service: ProjectService) {
  const list: RequestHandler = async (req, res) =>
    res.json(await service.list(auth.http.identity(req), req.query));
  const detail: RequestHandler = async (req, res) =>
    res.json({
      project: await service.detail(
        auth.http.identity(req),
        req.params.id,
        req.query,
      ),
    });
  const history: RequestHandler = async (req, res) =>
    res.json(
      await service.history(auth.http.identity(req), req.params.id, req.query),
    );
  const create: RequestHandler = async (req, res) => {
    res.status(201).json({
      project: await service.create(auth.http.identity(req), req.body),
    });
  };
  return { list, detail, history, create };
}
