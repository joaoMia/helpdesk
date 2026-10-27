import type { RequestHandler } from 'express';
import type { AuthService } from './auth.service.js';
import type { authHttp } from './auth.http.js';
export function authController(
  service: AuthService,
  http: ReturnType<typeof authHttp>,
) {
  const register: RequestHandler = async (req, res) =>
    res.status(201).json({ user: await service.register(req.body) });
  const login: RequestHandler = async (req, res) => {
    const result = await service.login(req.body);
    http.issue(res, result, true);
    res.json({ user: result.user });
  };
  const refresh: RequestHandler = async (req, res) => {
    try {
      const result = await service.refresh(http.read(req, http.names.refresh));
      http.issue(res, result, false);
      res.json({ user: result.user });
    } catch (error) {
      http.clear(res);
      throw error;
    }
  };
  const logout: RequestHandler = async (req, res) => {
    await service.logout(
      http.read(req, http.names.refresh),
      http.read(req, http.names.access),
    );
    http.clear(res);
    res.status(204).end();
  };
  const me: RequestHandler = (req, res) => {
    res.json({ user: http.identity(req).user });
  };
  const changePassword: RequestHandler = async (req, res) => {
    await service.changePassword(http.identity(req), req.body);
    http.clear(res);
    res.status(204).end();
  };
  return { register, login, refresh, logout, me, changePassword };
}
