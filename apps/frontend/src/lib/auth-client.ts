import {
  publicUserSchema,
  profileResultSchema,
  technicianListSchema,
  technicianSchema,
  technicianCreatedSchema,
  categorySchema,
  catalogServiceSchema,
  categoryListSchema,
  serviceListSchema,
  ticketListSchema,
  ticketDetailSchema,
  ticketHistorySchema,
  openedTicketSchema,
} from '@helpdesk/contracts';
import type { TechnicianInput, TechnicianUpdate } from '@helpdesk/contracts';
import type { UpdateProfile } from '@helpdesk/contracts';
import type { PublicUser } from '@helpdesk/contracts';
import type { TicketQuery, CreateTicketHttp } from '@helpdesk/contracts';
import type {
  CategoryInput,
  CategoryUpdate,
  ServiceInput,
  ServiceUpdate,
  CatalogQuery,
} from '@helpdesk/contracts';

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
  async function request(path: string, options: RequestInit, target = base) {
    try {
      return await transport(target + path, options);
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
  async function mutate(
    path: string,
    body: unknown = {},
    method = 'POST',
    target = base,
  ) {
    const { csrfToken } = await decode(await get('/csrf'));
    return decode(
      await request(
        path,
        {
          method,
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken,
          },
          body: JSON.stringify(body),
        },
        target,
      ),
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
  async function catalogGet(kind: 'categories' | 'services', path: string) {
    const target = base.replace(/\/auth$/, '/' + kind);
    let response = await request(
      path,
      { credentials: 'include', cache: 'no-store' },
      target,
    );
    if (response.status === 401) {
      await refresh();
      response = await request(
        path,
        { credentials: 'include', cache: 'no-store' },
        target,
      );
    }
    return decode(response);
  }
  async function catalogWrite(
    kind: 'categories' | 'services',
    input: unknown,
    id?: string,
  ) {
    const target = base.replace(/\/auth$/, '/' + kind),
      path = id ? '/' + encodeURIComponent(id) : '',
      method = id ? 'PATCH' : 'POST';
    try {
      return await mutate(path, input, method, target);
    } catch (e) {
      if (!(e instanceof AuthError) || e.code !== 'SESSION_INVALID') throw e;
      await refresh();
      return mutate(path, input, method, target);
    }
  }
  const catalogSearch = (query: Partial<CatalogQuery>) =>
    '?' +
    new URLSearchParams(
      Object.entries(query)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    ).toString();
  async function ticketGet(path: string) {
    const target = base.replace(/\/auth$/, '/tickets');
    let response = await request(
      path,
      { credentials: 'include', cache: 'no-store' },
      target,
    );
    if (response.status === 401) {
      await refresh();
      response = await request(
        path,
        { credentials: 'include', cache: 'no-store' },
        target,
      );
    }
    return decode(response);
  }
  return {
    me,
    async tickets(query: Partial<TicketQuery> = {}) {
      const search = new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      );
      return ticketListSchema.parse(await ticketGet('?' + search.toString()));
    },
    async ticket(id: string) {
      return ticketDetailSchema.parse(
        (await ticketGet('/' + encodeURIComponent(id))).ticket,
      );
    },
    async ticketHistory(id: string, page = 1, pageSize = 10) {
      return ticketHistorySchema.parse(
        await ticketGet(
          '/' +
            encodeURIComponent(id) +
            '/history?' +
            new URLSearchParams({
              page: String(page),
              pageSize: String(pageSize),
            }),
        ),
      );
    },
    async createTicket(input: CreateTicketHttp) {
      const target = base.replace(/\/auth$/, '/tickets');
      try {
        return openedTicketSchema.parse(
          (await mutate('', input, 'POST', target)).ticket,
        );
      } catch (e) {
        if (!(e instanceof AuthError) || e.code !== 'SESSION_INVALID') throw e;
        await refresh();
        return openedTicketSchema.parse(
          (await mutate('', input, 'POST', target)).ticket,
        );
      }
    },
    async categories(query: Partial<CatalogQuery> = {}) {
      return categoryListSchema.parse(
        await catalogGet('categories', catalogSearch(query)),
      );
    },
    async category(id: string) {
      return categorySchema.parse(
        (await catalogGet('categories', '/' + encodeURIComponent(id))).item,
      );
    },
    async services(query: Partial<CatalogQuery> = {}) {
      return serviceListSchema.parse(
        await catalogGet('services', catalogSearch(query)),
      );
    },
    async service(id: string) {
      return catalogServiceSchema.parse(
        (await catalogGet('services', '/' + encodeURIComponent(id))).item,
      );
    },
    async createCategory(input: CategoryInput) {
      return categorySchema.parse(
        (await catalogWrite('categories', input)).item,
      );
    },
    async updateCategory(id: string, input: CategoryUpdate) {
      return categorySchema.parse(
        (await catalogWrite('categories', input, id)).item,
      );
    },
    async createService(input: ServiceInput) {
      return catalogServiceSchema.parse(
        (await catalogWrite('services', input)).item,
      );
    },
    async updateService(id: string, input: ServiceUpdate) {
      return catalogServiceSchema.parse(
        (await catalogWrite('services', input, id)).item,
      );
    },
    async technicians(query: {
      page: number;
      pageSize: number;
      search: string;
    }) {
      const target = base.replace(/\/auth$/, '/technicians');
      const path =
        '?' +
        new URLSearchParams({
          page: String(query.page),
          pageSize: String(query.pageSize),
          search: query.search,
        });
      let response = await request(
        path,
        { credentials: 'include', cache: 'no-store' },
        target,
      );
      if (response.status === 401) {
        await refresh();
        response = await request(
          path,
          { credentials: 'include', cache: 'no-store' },
          target,
        );
      }
      return technicianListSchema.parse(await decode(response));
    },
    async technician(id: string) {
      const target = base.replace(/\/auth$/, '/technicians');
      let response = await request(
        '/' + encodeURIComponent(id),
        { credentials: 'include', cache: 'no-store' },
        target,
      );
      if (response.status === 401) {
        await refresh();
        response = await request(
          '/' + encodeURIComponent(id),
          { credentials: 'include', cache: 'no-store' },
          target,
        );
      }
      return technicianSchema.parse((await decode(response)).technician);
    },
    async createTechnician(input: TechnicianInput) {
      const target = base.replace(/\/auth$/, '/technicians');
      try {
        return technicianCreatedSchema.parse(
          await mutate('', input, 'POST', target),
        );
      } catch (e) {
        if (!(e instanceof AuthError) || e.code !== 'SESSION_INVALID') throw e;
        await refresh();
        return technicianCreatedSchema.parse(
          await mutate('', input, 'POST', target),
        );
      }
    },
    async updateTechnician(id: string, input: TechnicianUpdate) {
      const target = base.replace(/\/auth$/, '/technicians');
      try {
        return technicianSchema.parse(
          (await mutate('/' + encodeURIComponent(id), input, 'PATCH', target))
            .technician,
        );
      } catch (e) {
        if (!(e instanceof AuthError) || e.code !== 'SESSION_INVALID') throw e;
        await refresh();
        return technicianSchema.parse(
          (await mutate('/' + encodeURIComponent(id), input, 'PATCH', target))
            .technician,
        );
      }
    },
    async profile() {
      const target = base.replace(/\/auth$/, '/users');
      let response = await request(
        '/me',
        { credentials: 'include', cache: 'no-store' },
        target,
      );
      if (response.status === 401) {
        await refresh();
        response = await request(
          '/me',
          { credentials: 'include', cache: 'no-store' },
          target,
        );
      }
      return publicUserSchema.parse((await decode(response)).user);
    },
    async updateProfile(input: UpdateProfile) {
      const target = base.replace(/\/auth$/, '/users');
      try {
        return profileResultSchema.parse(
          await mutate('/me', input, 'PATCH', target),
        );
      } catch (error) {
        if (!(error instanceof AuthError) || error.code !== 'SESSION_INVALID')
          throw error;
        await refresh();
        return profileResultSchema.parse(
          await mutate('/me', input, 'PATCH', target),
        );
      }
    },
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
