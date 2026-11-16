import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { TicketApiService } from './ticket-api.service.js';
import { ApplicationError } from '../../shared/errors.js';
export function ticketController(auth: AuthRuntime, service: TicketApiService) {
  const overview: RequestHandler = async (req, res) =>
    res.json(await service.overview(auth.http.identity(req), req.query));
  const assignees: RequestHandler = async (req, res) =>
    res.json(await service.assignees(auth.http.identity(req), req.query));

  const assign: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não são permitidos.',
      );
    res.json({
      ticket: await service.assign(
        auth.http.identity(req),
        req.params.id,
        req.body,
      ),
    });
  };
  const triageDetail: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não são permitidos.',
      );
    res.json({
      ticket: await service.triageDetail(
        auth.http.identity(req),
        req.params.id,
      ),
    });
  };
  const start: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros adicionais não são permitidos.',
      );
    res.json({
      ticket: await service.start(
        auth.http.identity(req),
        req.params.id,
        req.body,
      ),
    });
  };
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
  const retire: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros extras não são permitidos.',
      );
    res.json(
      await service.retire(auth.http.identity(req), req.params.id, req.body),
    );
  };
  const operational: RequestHandler = async (req, res) =>
    res.json({
      ticket: await service.operational(
        auth.http.identity(req),
        req.params.id,
        req.query,
      ),
    });
  return {
    operational,
    retire,
    assign,
    triageDetail,
    list,
    detail,
    history,
    create,
    triage,
    classify,
    start,
    overview,
    assignees,
  };
}
