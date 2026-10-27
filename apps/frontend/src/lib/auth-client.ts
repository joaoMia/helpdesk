import { publicUserSchema } from '@helpdesk/contracts';
import type { PublicUser } from '@helpdesk/contracts';

export class AuthError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
// Only CSRF is read in memory. JWT and refresh credentials remain HttpOnly cookies.
export function createAuthClient(
  transport: typeof fetch = (...args) => fetch(...args),
  base = '/api/auth',
) {
  let refreshing: Promise<void> | undefined;
  async function request(path: string, options: RequestInit) {
    try {
      return await transport(base + path, options);
    } catch {
      throw new AuthError(
        0,
        'API_UNAVAILABLE',
        'Não foi possível conectar à API. Tente novamente em instantes.',
      );
    }
  }
  async function decode(response: Response) {
    if (response.status >= 500)
      throw new AuthError(
        response.status,
        'API_UNAVAILABLE',
        'Serviço temporariamente indisponível. Tente novamente em instantes.',
      );
    let body;
    try {
      body = response.status === 204 ? null : await response.json();
    } catch {
      throw new AuthError(
        response.status,
        'INVALID_RESPONSE',
        'Não foi possível obter uma resposta válida da API. Tente novamente.',
      );
    }
    if (!response.ok)
      throw new AuthError(
        response.status,
        body?.error?.code ?? 'REQUEST_FAILED',
        body?.error?.message ?? 'Não foi possível concluir a solicitação.',
      );
    return body;
  }
  const get = (path: string) =>
    request(path, { credentials: 'include', cache: 'no-store' });
  async function mutate(path: string, body: unknown = {}, method = 'POST') {
    const { csrfToken } = await decode(await get('/csrf'));
    return decode(
      await request(path, {
        method,
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify(body),
      }),
    );
  }
  async function refresh() {
    if (!refreshing) {
      const renew = async () => {
        // Another tab may already have renewed while we waited for the lock.
        if ((await get('/me')).ok) return;
        await mutate('/refresh');
      };
      refreshing = (
        typeof navigator !== 'undefined' && navigator.locks
          ? navigator.locks
              .request('helpdesk-auth-refresh', renew)
              .then(() => undefined)
          : renew()
      ).finally(() => {
        refreshing = undefined;
      });
    }
    return refreshing;
  }
  async function me(): Promise<PublicUser> {
    let response = await get('/me');
    if (response.status === 401) {
      await refresh();
      response = await get('/me');
    }
    return publicUserSchema.parse((await decode(response)).user);
  }
  return {
    me,
    async register(input: { name: string; email: string; password: string }) {
      await mutate('/register', input);
    },
    async login(input: { email: string; password: string }) {
      return publicUserSchema.parse((await mutate('/login', input)).user);
    },
    async logout() {
      await mutate('/logout');
    },
    async changePassword(input: {
      currentPassword: string;
      newPassword: string;
    }) {
      try {
        await mutate('/change-password', input, 'PATCH');
      } catch (error) {
        // A 401 is emitted before writes; retry once after renewing the access JWT.
        if (!(error instanceof AuthError) || error.code !== 'SESSION_INVALID')
          throw error;
        await refresh();
        await mutate('/change-password', input, 'PATCH');
      }
    },
  };
}
export const authClient = createAuthClient();
