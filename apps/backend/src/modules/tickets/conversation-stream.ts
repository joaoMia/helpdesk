import type { RequestHandler } from 'express';
import { createHash } from 'node:crypto';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { ConversationService } from './conversation.service.js';
import { ApplicationError } from '../../shared/errors.js';
const connections = new Map<string, number>();

// PostgreSQL is the shared source of truth, including across backend processes.
// Frames carry invalidations only; messages are fetched through the scoped API.
export function conversationStream(
  auth: AuthRuntime,
  service: Pick<ConversationService, 'revision'>,
): RequestHandler {
  return async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros não permitidos.',
      );
    const access = auth.http.read(req, auth.http.names.access);
    const identity = auth.http.identity(req);
    let previous = await service.revision(identity, req.params.id);
    if (res.destroyed) return;
    const key = identity.user.id;
    if ((connections.get(key) ?? 0) >= 8)
      throw new ApplicationError(
        'TOO_MANY_CONNECTIONS',
        429,
        'Feche outras conversas antes de conectar novamente.',
      );
    connections.set(key, (connections.get(key) ?? 0) + 1);
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      const count = (connections.get(key) ?? 1) - 1;
      if (count) connections.set(key, count);
      else connections.delete(key);
    };
    res.once('close', stop);
    const emit = (event: string, revision: string) => {
      if (!stopped)
        res.write(
          `id: ${createHash('sha256').update(revision).digest('hex')}\nevent: ${event}\ndata: {}\n\n`,
        );
    };
    emit('sync', previous);
    const tick = async () => {
      try {
        // Recheck JWT expiration, revocation, active account, role and ownership.
        const current = await auth.service.authenticate(access);
        if (
          current.user.mustChangePassword ||
          current.user.id !== identity.user.id ||
          current.user.role !== identity.user.role
        )
          throw new Error('Session changed');
        const revision = await service.revision(current, req.params.id);
        if (stopped) return;
        if (res.writableLength > 65536) {
          stop();
          res.end();
          return;
        }
        if (revision !== previous) {
          previous = revision;
          emit('sync', revision);
        } else res.write(': heartbeat\n\n');
        timer = setTimeout(tick, 1500);
        timer.unref();
      } catch {
        if (!stopped) {
          res.write('event: unavailable\ndata: {}\n\n');
          stop();
          res.end();
        }
      }
    };
    timer = setTimeout(tick, 1500);
    timer.unref();
  };
}
