import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { TechnicianService } from './technician.service.js';
import { ApplicationError } from '../../shared/errors.js';
export function technicianController(
  auth: AuthRuntime,
  service: TechnicianService,
) {
  const list: RequestHandler = async (req, res) =>
    res.json(await service.list(auth.http.identity(req), req.query));
  const detail: RequestHandler = async (req, res) =>
    res.json({
      technician: await service.detail(auth.http.identity(req), req.params.id),
    });
  const create: RequestHandler = async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res
      .status(201)
      .json(await service.create(auth.http.identity(req), req.body));
  };
  const update: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não são permitidos.',
      );
    res.json({
      technician: await service.update(
        auth.http.identity(req),
        req.params.id,
        req.body,
      ),
    });
  };
  return { list, detail, create, update };
}
