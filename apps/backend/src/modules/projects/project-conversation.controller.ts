import { privateAttachmentHeaders } from '../tickets/attachment-download.js';
import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { ProjectConversationService } from './project-conversation.service.js';
export function projectConversationController(
  auth: AuthRuntime,
  service: ProjectConversationService,
) {
  const read: RequestHandler = async (req, res) =>
    res.json(
      await service.read(auth.http.identity(req), req.params.id, req.query),
    );
  const send: RequestHandler = async (req, res) =>
    res
      .status(201)
      .json(
        await service.send(auth.http.identity(req), req.params.id, req.body),
      );
  const upload: RequestHandler = async (req, res) =>
    res.status(201).json({
      attachment: await service.upload(
        auth.http.identity(req),
        req.params.id,
        req.query.name,
        req.body,
      ),
    });
  const discard: RequestHandler = async (req, res) => {
    await service.discard(
      auth.http.identity(req),
      req.params.id,
      req.params.fileId,
      req.query,
    );
    res.status(204).end();
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
  return { read, send, upload, discard, download };
}
