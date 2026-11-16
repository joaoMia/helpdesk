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
    res
      .set({
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': "sandbox; default-src 'none'",
        'Content-Type': file.mime,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="arquivo${file.mime === 'image/png' ? '.png' : '.txt'}"; filename*=UTF-8''${encodeURIComponent(file.name).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}`,
      })
      .send(bytes);
  };
  return { upload, discard, list, download };
}
