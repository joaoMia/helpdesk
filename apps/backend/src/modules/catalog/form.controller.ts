import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { FormService } from './form.service.js';
import { ApplicationError } from '../../shared/errors.js';
export function formController(auth: AuthRuntime, service: FormService) {
  const read: RequestHandler = async (req, res) => {
    res.json(
      await service.read(auth.http.identity(req), req.params.id, req.query),
    );
  };
  const write =
    (publish: boolean): RequestHandler =>
    async (req, res) => {
      if (Object.keys(req.query).length)
        throw new ApplicationError(
          'INVALID_INPUT',
          400,
          'Parâmetros não permitidos.',
        );
      res
        .status(publish ? 201 : 200)
        .json(
          await service.write(
            auth.http.identity(req),
            req.params.id,
            req.body,
            publish,
          ),
        );
    };
  return { read, save: write(false), publish: write(true) };
}
