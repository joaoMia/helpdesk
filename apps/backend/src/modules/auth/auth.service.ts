import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  publicUserSchema,
} from '@helpdesk/contracts';
import type { PublicUser } from '@helpdesk/contracts';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import type { AuthConfig } from './auth.config.js';
import { AuthRepository } from './auth.repository.js';
import { Passwords, hashPassword } from './password.js';

export const refreshHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
export const invalidSession = () =>
  new ApplicationError(
    'SESSION_INVALID',
    401,
    'Sessão ausente, expirada ou indisponível. Entre novamente.',
  );
const invalidLogin = () =>
  new ApplicationError(
    'INVALID_CREDENTIALS',
    401,
    'Credenciais inválidas ou conta indisponível.',
  );
const claims = z.object({ sub: z.uuid(), sid: z.uuid(), jti: z.uuid() });
export type Identity = { sessionId: string; user: PublicUser };
export class AuthService {
  private passwords = new Passwords();
  constructor(
    private repo: AuthRepository,
    readonly config: AuthConfig,
  ) {}
  public(user: {
    id: string;
    name: string;
    email: string;
    role: string;
    mustChangePassword: boolean;
  }) {
    return publicUserSchema.parse({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });
  }
  async register(payload: unknown) {
    const parsed = registerSchema.safeParse(payload);
    if (!parsed.success)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Informe nome, e-mail válido e senha de 12 a 128 caracteres; campos adicionais não são permitidos.',
      );
    const { name, email, password } = parsed.data;
    const passwordHash = await hashPassword(password);
    try {
      return this.public(await this.repo.register(name, email, passwordHash));
    } catch (error) {
      if (
        (error as { code?: string }).code === 'P2002' ||
        databaseErrorCode(error) === '23505'
      )
        throw new ApplicationError(
          'REGISTRATION_UNAVAILABLE',
          409,
          'Não foi possível concluir o cadastro. Se você já possui uma conta, tente entrar ou entre em contato com o suporte.',
        );
      throw error;
    }
  }
  async signAccess(userId: string, sessionId: string, now = new Date()) {
    const seconds = Math.floor(now.getTime() / 1000);
    return new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
      .setSubject(userId)
      .setJti(randomUUID())
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt(seconds)
      .setExpirationTime(seconds + this.config.accessSeconds)
      .sign(this.config.jwtKey);
  }
  async login(payload: unknown) {
    const parsed = loginSchema.safeParse(payload);
    if (!parsed.success) throw invalidLogin();
    const user = await this.repo.findByEmail(parsed.data.email);
    const valid = await this.passwords.verify(
      user?.passwordHash,
      parsed.data.password,
    );
    if (!valid || !user?.isActive) throw invalidLogin();
    const sessionId = randomUUID(),
      refreshToken = `${sessionId}.${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + this.config.refreshSeconds * 1000);
    const current = await this.repo.createSession(
      user.id,
      user.passwordHash,
      user.email,
      sessionId,
      refreshHash(refreshToken),
      expiresAt,
    );
    if (!current) throw invalidLogin();
    return {
      user: this.public(current),
      accessToken: await this.signAccess(current.id, sessionId),
      refreshToken,
      expiresAt,
    };
  }
  async authenticate(accessToken: string | undefined): Promise<Identity> {
    if (!accessToken) throw invalidSession();
    let ids: z.infer<typeof claims>;
    try {
      const { payload } = await jwtVerify(accessToken, this.config.jwtKey, {
        algorithms: ['HS256'],
        typ: 'at+jwt',
        issuer: this.config.issuer,
        audience: this.config.audience,
        requiredClaims: ['sub', 'sid', 'jti', 'iat', 'exp'],
        maxTokenAge: '15m',
      });
      ids = claims.parse(payload);
    } catch {
      throw invalidSession();
    }
    const session = await this.repo.session(ids.sid);
    if (
      !session ||
      session.userId !== ids.sub ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      !session.user.isActive
    )
      throw invalidSession();
    return { sessionId: session.id, user: this.public(session.user) };
  }
  async refresh(token: string | undefined) {
    if (!token || !/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(token))
      throw invalidSession();
    const sessionId = token.slice(0, 36),
      replacement = `${sessionId}.${randomBytes(32).toString('base64url')}`;
    const session = await this.repo.rotate(
      refreshHash(token),
      refreshHash(replacement),
      new Date(),
    );
    if (!session || session.id !== sessionId) throw invalidSession();
    return {
      user: this.public(session.user),
      accessToken: await this.signAccess(session.userId, session.id),
      refreshToken: replacement,
      expiresAt: session.expiresAt,
    };
  }
  async logout(token: string | undefined, access?: string) {
    if (access) {
      try {
        const identity = await this.authenticate(access);
        await this.repo.revokeSession(identity.sessionId, new Date());
      } catch (error) {
        if (!(
          error instanceof ApplicationError && error.code === 'SESSION_INVALID'
        ))
          throw error;
      }
    }
    if (token && token.length <= 100)
      await this.repo.logout(refreshHash(token), new Date());
  }
  async changePassword(identity: Identity, payload: unknown) {
    const parsed = changePasswordSchema.safeParse(payload);
    if (!parsed.success)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Informe a senha atual e uma nova senha de 12 a 128 caracteres.',
      );
    const user = await this.repo.findUser(identity.user.id);
    if (
      !user ||
      !(await this.passwords.verify(
        user.passwordHash,
        parsed.data.currentPassword,
      ))
    )
      throw invalidLogin();
    if (
      user.mustChangePassword &&
      parsed.data.currentPassword === parsed.data.newPassword
    )
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Escolha uma senha diferente da credencial provisória.',
      );
    const passwordHash = await hashPassword(parsed.data.newPassword);
    if (
      !(await this.repo.changePassword(
        user.id,
        identity.sessionId,
        user.passwordHash,
        passwordHash,
        new Date(),
      ))
    )
      throw invalidSession();
  }
}
