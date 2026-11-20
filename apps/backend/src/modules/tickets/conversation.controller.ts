import { privateAttachmentHeaders } from './attachment-download.js';
import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { Identity } from '../auth/auth.service.js';
import { ApplicationError } from '../../shared/errors.js';
export function conversationController(
  auth: AuthRuntime,
  service: {
    read: (identity: Identity, id: unknown, query: unknown) => Promise<unknown>;
    comment: (
      identity: Identity,
      id: unknown,
      input: unknown,
    ) => Promise<unknown>;
    solve: (
      identity: Identity,
      id: unknown,
      input: unknown,
    ) => Promise<unknown>;
    upload: (
      identity: Identity,
      id: unknown,
      name: unknown,
      bytes: unknown,
      draft?: boolean,
    ) => Promise<unknown>;
    discard: (
      identity: Identity,
      id: unknown,
      fileId: unknown,
    ) => Promise<unknown>;
    download: (
      identity: Identity,
      id: unknown,
      fileId: unknown,
    ) => Promise<{ file: { mime: string; name: string }; bytes: Buffer }>;
  },
) {
  const clean = (req: Parameters<RequestHandler>[0]) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não são permitidos.',
      );
  };
  const read: RequestHandler = async (req, res) =>
    res.json(
      await service.read(auth.http.identity(req), req.params.id, req.query),
    );
  const comment: RequestHandler = async (req, res) => {
    clean(req);
    res
      .status(201)
      .json(
        await service.comment(auth.http.identity(req), req.params.id, req.body),
      );
  };
  const solve: RequestHandler = async (req, res) => {
    clean(req);
    res
      .status(201)
      .json(
        await service.solve(auth.http.identity(req), req.params.id, req.body),
      );
  };
  const upload: RequestHandler = async (req, res) => {
    if (
      Object.keys(req.query).some((k) => !['name', 'draft'].includes(k)) ||
      ![undefined, 'true'].includes(req.query.draft as string | undefined)
    )
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não são permitidos.',
      );
    res.status(201).json({
      attachment: await service.upload(
        auth.http.identity(req),
        req.params.id,
        req.query.name,
        req.body,
        req.query.draft === 'true',
      ),
    });
  };
  const download: RequestHandler = async (req, res) => {
    if (
      Object.keys(req.query).some((k) => k !== 'preview') ||
      ![undefined, 'true'].includes(req.query.preview as string | undefined)
    )
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não são permitidos.',
      );
    const { file, bytes } = await service.download(
      auth.http.identity(req),
      req.params.id,
      req.params.fileId,
    );
    const inline = req.query.preview === 'true' && file.mime === 'image/png';
    res.set(privateAttachmentHeaders(file, inline)).send(bytes);
  };
  const discard: RequestHandler = async (req, res) => {
    clean(req);
    await service.discard(
      auth.http.identity(req),
      req.params.id,
      req.params.fileId,
    );
    res.status(204).end();
  };
  return { read, comment, solve, upload, download, discard };
}
