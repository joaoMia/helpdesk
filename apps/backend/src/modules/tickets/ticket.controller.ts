import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { TicketApiService } from './ticket-api.service.js';
import { ApplicationError } from '../../shared/errors.js';
export function ticketController(auth: AuthRuntime, service: TicketApiService) {
  const triage: RequestHandler = async (req, res) =>
    res.json(await service.triage(auth.http.identity(req), req.query));
  const classify: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não são permitidos.',
      );
    res.json({
      ticket: await service.classify(
        auth.http.identity(req),
        req.params.id,
        req.body,
      ),
    });
  };
  const list: RequestHandler = async (req, res) =>
    res.json(await service.list(auth.http.identity(req), req.query));
  const detail: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não são permitidos.',
      );
    res.json({
      ticket: await service.detail(auth.http.identity(req), req.params.id),
    });
  };
  const history: RequestHandler = async (req, res) =>
    res.json(
      await service.history(auth.http.identity(req), req.params.id, req.query),
    );
  const create: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não são permitidos.',
      );
    const ticket = await service.open(auth.http.identity(req), req.body);
    res
      .location('/tickets/' + ticket.id)
      .status(201)
      .json({ ticket });
  };
  return { list, detail, history, create, triage, classify };
}
