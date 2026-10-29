import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { ProfileService } from './profile.service.js';
import { ApplicationError } from '../../shared/errors.js';
export function profileController(service: ProfileService, auth: AuthRuntime) {
  const get: RequestHandler = (req, res) =>
    res.json({ user: auth.http.identity(req).user });
  const patch: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Esta operação não aceita parâmetros de seleção de usuário.',
      );
    const result = await service.update(auth.http.identity(req), req.body);
    if (result.reauthenticate) auth.http.clear(res);
    res.json(result);
  };
  return { get, patch };
}
