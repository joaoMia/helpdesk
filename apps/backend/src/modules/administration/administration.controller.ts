import type { RequestHandler } from 'express';
import type { AuthRuntime } from '../auth/auth.routes.js';
import type { AdministrationService } from './administration.service.js';
import type { AdministrativeKind } from './administration.repository.js';
import { ApplicationError } from '../../shared/errors.js';
export function administrationController(
  auth: AuthRuntime,
  service: AdministrationService,
) {
  const identity = (req: Parameters<RequestHandler>[0]) =>
    auth.http.identity(req);
  const removeUser: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros extras não são permitidos.',
      );
    res.json(await service.removeUser(identity(req), req.params.id, req.body));
  };
  const retire: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros extras não são permitidos.',
      );
    res.json(await service.retire(identity(req), req.body));
  };
  const users: RequestHandler = async (req, res) =>
    res.json(await service.users(identity(req), req.query));
  const user: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros extras não são permitidos.',
      );
    res.json({ user: await service.user(identity(req), req.params.id) });
  };
  const createUser: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros extras não são permitidos.',
      );
    res
      .set('Cache-Control', 'no-store')
      .status(201)
      .json(await service.createUser(identity(req), req.body));
  };
  const updateUser: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros extras não são permitidos.',
      );
    res.json({
      user: await service.updateUser(identity(req), req.params.id, req.body),
    });
  };
  const resetPassword: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros extras não são permitidos.',
      );
    res
      .set('Cache-Control', 'no-store')
      .json(
        await service.resetPassword(identity(req), req.params.id, req.body),
      );
  };
  function entity(kind: AdministrativeKind) {
    const list: RequestHandler = async (req, res) =>
      res.json(await service.list(kind, identity(req), req.query));
    const detail: RequestHandler = async (req, res) => {
      if (Object.keys(req.query).length)
        throw new ApplicationError(
          'INVALID_INPUT',
          400,
          'Parâmetros extras não são permitidos.',
        );
      res.json({
        item: await service.detail(kind, identity(req), req.params.id),
      });
    };
    const save: RequestHandler = async (req, res) => {
      if (Object.keys(req.query).length)
        throw new ApplicationError(
          'INVALID_INPUT',
          400,
          'Parâmetros extras não são permitidos.',
        );
      const id = req.params.id;
      res
        .status(id ? 200 : 201)
        .json({ item: await service.save(kind, identity(req), id, req.body) });
    };
    return { list, detail, save };
  }
  const defaults: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros extras não são permitidos.',
      );
    res.json({ settings: await service.defaults(identity(req)) });
  };
  const setDefault: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Parâmetros extras não são permitidos.',
      );
    res.json({ settings: await service.setDefault(identity(req), req.body) });
  };
  const versions: RequestHandler = async (req, res) =>
    res.json(await service.versions(identity(req), req.params.id, req.query));
  return {
    versions,
    removeUser,
    retire,
    users,
    user,
    createUser,
    updateUser,
    resetPassword,
    entity,
    defaults,
    setDefault,
  };
}
