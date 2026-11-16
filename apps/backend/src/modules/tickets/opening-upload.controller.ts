import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { OpeningUploadService } from './opening-upload.service.js';
import { ApplicationError } from '../../shared/errors.js';
export function openingUploadController(
  auth: AuthRuntime,
  service: OpeningUploadService,
) {
  const upload: RequestHandler = async (req, res) => {
    res.status(201).json({
      upload: await service.upload(
        auth.http.identity(req),
        req.query,
        req.body,
      ),
    });
  };
  const discard: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não permitidos.',
      );
    await service.discard(auth.http.identity(req), req.params.id);
    res.status(204).end();
  };
  return { upload, discard };
}
