import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { CatalogService } from './catalog.service.js';
import type { CatalogKind } from './catalog.repository.js';
import { ApplicationError } from '../../shared/errors.js';
export function catalogController(
  kind: CatalogKind,
  auth: AuthRuntime,
  service: CatalogService,
) {
  const list: RequestHandler = async (req, res) =>
    res.json(await service.list(kind, auth.http.identity(req), req.query));
  const detail: RequestHandler = async (req, res) =>
    res.json({
      item: await service.detail(kind, auth.http.identity(req), req.params.id),
    });
  const write =
    (update: boolean): RequestHandler =>
    async (req, res) => {
      if (Object.keys(req.query).length)
        throw new ApplicationError(
          'INVALID_INPUT',
          400,
          'Parâmetros adicionais não são permitidos.',
        );
      res.status(update ? 200 : 201).json({
        item: await service.write(
          kind,
          auth.http.identity(req),
          req.body,
          update ? req.params.id : undefined,
        ),
      });
    };
  return { list, detail, create: write(false), update: write(true) };
}
