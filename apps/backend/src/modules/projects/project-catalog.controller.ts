import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { ProjectCatalogService } from './project-catalog.service.js';
export function projectCatalogController(
  auth: AuthRuntime,
  service: ProjectCatalogService,
) {
  return (op: string): RequestHandler =>
    async (req, res) => {
      res
        .status(op === 'create' ? 201 : 200)
        .json(
          await service.run(
            auth.http.identity(req),
            op,
            req.params.id,
            req.body,
            req.query,
          ),
        );
    };
}
