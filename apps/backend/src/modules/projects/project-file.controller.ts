import { privateAttachmentHeaders } from '../tickets/attachment-download.js';
import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { ProjectFileService } from './project-file.service.js';
export function projectFileController(
  auth: AuthRuntime,
  service: ProjectFileService,
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
    await service.discard(
      auth.http.identity(req),
      req.params.fileId,
      req.query,
    );
    res.sendStatus(204);
  };
  const list: RequestHandler = async (req, res) => {
    res.json(
      await service.list(auth.http.identity(req), req.params.id, req.query),
    );
  };
  const download: RequestHandler = async (req, res) => {
    const { file, bytes, inline } = await service.download(
      auth.http.identity(req),
      req.params.id,
      req.params.fileId,
      req.query,
    );
    res.set(privateAttachmentHeaders(file, inline)).send(bytes);
  };
  return { upload, discard, list, download };
}
