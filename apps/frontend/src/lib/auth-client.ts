import {
  projectCategoriesSchema,
  projectSubmissionSchema,
  projectAttachmentsSchema,
  projectWorkflowSchema,
  projectWorkflowListSchema,
  projectDashboardSchema,
  projectWorkflowHistorySchema,
} from '@helpdesk/contracts';
import {
  projectListSchema,
  projectRequestSchema,
  projectHistorySchema,
} from '@helpdesk/contracts';
import { personalDashboardSchema } from '@helpdesk/contracts';
import { loadAllOptions } from './paginated-options';
import {
  serviceFormSchema,
  openingUploadSchema,
  conversationSchema,
  attachmentSchema,
  ticketMetricsSchema,
  pendingReasonListSchema,
  slaPolicyListSchema,
  dashboardSchema,
  adminUserListSchema,
  adminUserSchema,
  adminUserCreatedSchema,
  companyListSchema,
  companySchema,
  departmentListSchema,
  departmentSchema,
  scheduleListSchema,
  scheduleSchema,
  scheduleVersionListSchema,
  organizationDefaultSchema,
} from '@helpdesk/contracts';
import type {
  AdminUserInput,
  AdminUserUpdate,
  AdminUserQuery,
  AdminPageQuery,
  CompanyInput,
  DepartmentInput,
  ScheduleInput,
  ScheduleUpdate,
} from '@helpdesk/contracts';
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
  triageListSchema,
  triageTicketSchema,
  startedTicketSchema,
  overviewListSchema,
  assigneeListSchema,
  assignedTicketSchema,
} from '@helpdesk/contracts';
import type { TechnicianInput, TechnicianUpdate } from '@helpdesk/contracts';
import type { UpdateProfile } from '@helpdesk/contracts';
import type { PublicUser } from '@helpdesk/contracts';
import type {
  TicketQuery,
  CreateTicketHttp,
  TriageQuery,
  ClassifyPriority,
  OverviewQuery,
  AssigneeQuery,
} from '@helpdesk/contracts';
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
    if (response.status >= 500) {
      const body = await response.json().catch(() => null);
      const code = body?.error?.code;
      if (
        response.status === 503 &&
        (code === 'ATTACHMENT_SCHEMA_OUTDATED' ||
          code === 'UPLOAD_UNAVAILABLE') &&
        typeof body.error.message === 'string'
      ) {
        throw new AuthError(response.status, code, body.error.message);
      }
      throw new AuthError(
        response.status,
        'API_UNAVAILABLE',
        'Serviço temporariamente indisponível. Tente novamente em instantes.',
      );
    }
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
  async function ticketGet(
    path: string,
    resource: 'tickets' | 'projects' = 'tickets',
  ) {
    const target = base.replace(/\/auth$/, '/' + resource);
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

  async function projectRead(path: string) {
    const target = base.replace(/\/auth$/, '/projects');
    let r = await request(
      path,
      { credentials: 'include', cache: 'no-store' },
      target,
    );
    if (r.status === 401) {
      await refresh();
      r = await request(
        path,
        { credentials: 'include', cache: 'no-store' },
        target,
      );
    }
    return decode(r);
  }
  async function adminGet(path: string, q: Record<string, unknown> = {}) {
    const query = new URLSearchParams(
      Object.entries(q)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => [k, String(v)]),
    );
    const target = base.replace(/\/auth$/, '/admin');
    let response = await request(
      path + '?' + query.toString(),
      { credentials: 'include', cache: 'no-store' },
      target,
    );
    if (response.status === 401) {
      await refresh();
      response = await request(
        path + '?' + query.toString(),
        { credentials: 'include', cache: 'no-store' },
        target,
      );
    }
    return decode(response);
  }
  async function adminWrite(path: string, input: unknown, method = 'POST') {
    const target = base.replace(/\/auth$/, '/admin');
    try {
      return await mutate(path, input, method, target);
    } catch (e) {
      if (!(e instanceof AuthError) || e.code !== 'SESSION_INVALID') throw e;
      await refresh();
      return mutate(path, input, method, target);
    }
  }
  return {
    async uploadProjectOpeningFile(
      input: { categoryId: string; versionId: string; fieldKey: string },
      file: File,
    ) {
      const { csrfToken } = await decode(await get('/csrf'));
      const q = new URLSearchParams({ ...input, name: file.name });
      return openingUploadSchema.parse(
        (
          await decode(
            await request(
              '/opening-uploads?' + q,
              {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'X-CSRF-Token': csrfToken,
                },
                body: file,
              },
              base.replace(/\/auth$/, '/projects'),
            ),
          )
        ).upload,
      );
    },
    async discardProjectOpeningFile(id: string) {
      return mutate(
        '/opening-uploads/' + encodeURIComponent(id),
        undefined,
        'DELETE',
        base.replace(/\/auth$/, '/projects'),
      );
    },
    async projectAttachments(id: string) {
      return projectAttachmentsSchema.parse(
        await projectRead('/' + encodeURIComponent(id) + '/attachments'),
      );
    },
    me,
    async uploadOpeningFile(
      input: { serviceId: string; formVersionId: string; fieldKey: string },
      file: File,
    ) {
      const { csrfToken } = await decode(await get('/csrf'));
      const q = new URLSearchParams({ ...input, name: file.name });
      return openingUploadSchema.parse(
        (
          await decode(
            await request(
              '/opening-uploads?' + q,
              {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'X-CSRF-Token': csrfToken,
                },
                body: file,
              },
              base.replace(/\/auth$/, '/tickets'),
            ),
          )
        ).upload,
      );
    },
    async discardOpeningFile(id: string) {
      return mutate(
        '/opening-uploads/' + encodeURIComponent(id),
        undefined,
        'DELETE',
        base.replace(/\/auth$/, '/tickets'),
      );
    },
    async projectCategories() {
      return projectCategoriesSchema.parse(await projectRead('/categories'));
    },
    async changeProjectCategory(id: string | null, input: unknown) {
      return mutate(
        '/categories' + (id ? '/' + id : ''),
        input,
        id ? 'PATCH' : 'POST',
        base.replace(/\/auth$/, '/projects'),
      );
    },
    async bootstrapProjectCategories() {
      return mutate(
        '/categories/bootstrap',
        {},
        'POST',
        base.replace(/\/auth$/, '/projects'),
      );
    },
    async projectCategoryForm(id: string, version?: number) {
      return serviceFormSchema.parse(
        await projectRead(
          '/categories/' +
            id +
            '/form' +
            (version ? '?version=' + version : ''),
        ),
      );
    },
    async saveProjectCategoryForm(id: string, input: unknown) {
      return mutate(
        '/categories/' + id + '/form/draft',
        input,
        'PATCH',
        base.replace(/\/auth$/, '/projects'),
      );
    },
    async publishProjectCategoryForm(id: string, input: unknown) {
      return mutate(
        '/categories/' + id + '/form/publish',
        input,
        'POST',
        base.replace(/\/auth$/, '/projects'),
      );
    },
    async projectSubmission(id: string) {
      return projectSubmissionSchema.parse(
        await projectRead('/' + id + '/submission'),
      );
    },
    async serviceForm(id: string, version?: number) {
      return serviceFormSchema.parse(
        await catalogGet(
          'services',
          '/' +
            encodeURIComponent(id) +
            '/form' +
            (version ? '?version=' + version : ''),
        ),
      );
    },
    async saveServiceForm(id: string, input: unknown) {
      return mutate(
        '/' + encodeURIComponent(id) + '/form/draft',
        input,
        'PATCH',
        base.replace(/\/auth$/, '/services'),
      );
    },
    async publishServiceForm(id: string, input: unknown) {
      return mutate(
        '/' + encodeURIComponent(id) + '/form/publish',
        input,
        'POST',
        base.replace(/\/auth$/, '/services'),
      );
    },
    async ticketMetrics(id: string) {
      return ticketMetricsSchema.parse(
        await ticketGet('/' + encodeURIComponent(id) + '/metrics'),
      );
    },
    async ticketTransition(
      id: string,
      op: 'pending' | 'resume' | 'close',
      input: unknown = {},
    ) {
      return mutate(
        '/' + encodeURIComponent(id) + '/' + op,
        input,
        'POST',
        base.replace(/\/auth$/, '/tickets'),
      );
    },
    async pendingReasons(q: Record<string, unknown> = {}) {
      return pendingReasonListSchema.parse(
        await (async () => {
          const query = new URLSearchParams(
            Object.entries(q)
              .filter(([, v]) => v !== undefined && v !== '')
              .map(([k, v]) => [k, String(v)]),
          );
          const target = base.replace(/\/auth$/, '/pending-reasons');
          let r = await request(
            '?' + query,
            { credentials: 'include', cache: 'no-store' },
            target,
          );
          if (r.status === 401) {
            await refresh();
            r = await request(
              '?' + query,
              { credentials: 'include', cache: 'no-store' },
              target,
            );
          }
          return decode(r);
        })(),
      );
    },
    async savePendingReason(input: unknown, id?: string) {
      return adminWrite(
        '/pending-reasons' + (id ? '/' + encodeURIComponent(id) : ''),
        input,
        id ? 'PATCH' : 'POST',
      );
    },
    async slaPolicies(page = 1) {
      return slaPolicyListSchema.parse(
        await adminGet('/sla-policies', { page, pageSize: 10 }),
      );
    },
    async saveSlaPolicy(input: unknown) {
      return adminWrite('/sla-policies', input);
    },
    async dashboard(q: Record<string, unknown> = {}) {
      return dashboardSchema.parse(await adminGet('/dashboard', q));
    },
    async downloadAttachment(
      id: string,
      fileId: string,
      resource: 'tickets' | 'projects' | 'project-conversation' = 'tickets',
    ) {
      const apiResource =
          resource === 'project-conversation' ? 'projects' : resource,
        target = base.replace(/\/auth$/, '/' + apiResource),
        path =
          resource === 'project-conversation'
            ? '/' +
              encodeURIComponent(id) +
              '/conversation/attachments/' +
              encodeURIComponent(fileId)
            : '/' +
              encodeURIComponent(id) +
              '/attachments/' +
              encodeURIComponent(fileId);
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
      if (!response.ok) await decode(response);
      return response.blob();
    },
    async conversation(
      id: string,
      page = 1,
      resource: 'tickets' | 'projects' | 'project-conversation' = 'tickets',
    ) {
      return conversationSchema.parse(
        await ticketGet(
          '/' +
            encodeURIComponent(id) +
            '/conversation?page=' +
            page +
            '&pageSize=50',
          resource === 'project-conversation' ? 'projects' : resource,
        ),
      );
    },
    conversationStreamUrl(
      id: string,
      resource: 'tickets' | 'projects' | 'project-conversation' = 'tickets',
    ) {
      const apiResource =
        resource === 'project-conversation' ? 'projects' : resource;
      return (
        base.replace(/\/auth$/, '/' + apiResource) +
        '/' +
        encodeURIComponent(id) +
        '/conversation/stream'
      );
    },
    async discardAttachment(
      id: string,
      fileId: string,
      resource: 'tickets' | 'projects' | 'project-conversation' = 'tickets',
    ) {
      const apiResource =
          resource === 'project-conversation' ? 'projects' : resource,
        path =
          resource === 'project-conversation'
            ? '/' +
              encodeURIComponent(id) +
              '/conversation/attachments/' +
              encodeURIComponent(fileId) +
              '/draft'
            : '/' +
              encodeURIComponent(id) +
              '/attachments/' +
              encodeURIComponent(fileId) +
              '/draft';
      const { csrfToken } = await decode(await get('/csrf'));
      const response = await request(
        path,
        {
          method: 'DELETE',
          credentials: 'include',
          cache: 'no-store',
          headers: { 'X-CSRF-Token': csrfToken },
        },
        base.replace(/\/auth$/, '/' + apiResource),
      );
      if (!response.ok) await decode(response);
    },
    async addComment(
      id: string,
      content: string,
      attachmentIds: string[] = [],
      clientMessageId?: string,
      resource: 'tickets' | 'projects' | 'project-conversation' = 'tickets',
    ) {
      const apiResource =
        resource === 'project-conversation' ? 'projects' : resource;
      return mutate(
        '/' +
          encodeURIComponent(id) +
          (resource === 'project-conversation'
            ? '/conversation/messages'
            : '/comments'),
        {
          content,
          attachmentIds,
          ...(clientMessageId ? { clientMessageId } : {}),
        },
        'POST',
        base.replace(/\/auth$/, '/' + apiResource),
      );
    },
    async solveTicket(
      id: string,
      description: string,
      attachmentIds: string[] = [],
      resource: 'tickets' | 'projects' | 'project-conversation' = 'tickets',
      solvedAt?: string,
    ) {
      return mutate(
        '/' + encodeURIComponent(id) + '/solution',
        { description, attachmentIds, ...(solvedAt ? { solvedAt } : {}) },
        'POST',
        base.replace(/\/auth$/, '/' + resource),
      );
    },
    attachmentUrl(
      id: string,
      fileId: string,
      preview = false,
      resource: 'tickets' | 'projects' | 'project-conversation' = 'tickets',
    ) {
      const apiResource =
          resource === 'project-conversation' ? 'projects' : resource,
        path =
          resource === 'project-conversation'
            ? '/' +
              encodeURIComponent(id) +
              '/conversation/attachments/' +
              encodeURIComponent(fileId)
            : '/' +
              encodeURIComponent(id) +
              '/attachments/' +
              encodeURIComponent(fileId);
      return (
        base.replace(/\/auth$/, '/' + apiResource) +
        path +
        (preview ? '?preview=true' : '')
      );
    },
    async uploadAttachment(
      id: string,
      file: File,
      draft = false,
      resource: 'tickets' | 'projects' | 'project-conversation' = 'tickets',
    ) {
      const { csrfToken } = await decode(await get('/csrf'));
      const apiResource =
          resource === 'project-conversation' ? 'projects' : resource,
        path =
          resource === 'project-conversation'
            ? '/' +
              encodeURIComponent(id) +
              '/conversation/attachments?name=' +
              encodeURIComponent(file.name)
            : '/' +
              encodeURIComponent(id) +
              '/attachments?name=' +
              encodeURIComponent(file.name) +
              (draft ? '&draft=true' : '');
      return attachmentSchema.parse(
        (
          await decode(
            await request(
              path,
              {
                method: 'POST',
                credentials: 'include',
                cache: 'no-store',
                headers: {
                  'Content-Type': 'application/octet-stream',
                  'X-CSRF-Token': csrfToken,
                },
                body: file,
              },
              base.replace(/\/auth$/, '/' + apiResource),
            ),
          )
        ).attachment,
      );
    },
    async assigneeOptions(cancelled: () => boolean = () => false) {
      return loadAllOptions(
        async (page) =>
          assigneeListSchema.parse(
            await ticketGet('/assignees?page=' + page + '&pageSize=50'),
          ),
        cancelled,
      );
    },
    async retireRecord(
      kind: 'ticket' | 'service' | 'category',
      id: string,
      reason: string,
    ) {
      return kind === 'ticket'
        ? mutate(
            '/' + encodeURIComponent(id) + '/retirement',
            { reason },
            'POST',
            base.replace(/\/auth$/, '/tickets'),
          )
        : mutate(
            '/retirements',
            { kind, id, reason },
            'POST',
            base.replace(/\/auth$/, '/admin'),
          );
    },
    async deleteAdminUser(id: string) {
      return mutate(
        '/users/' + encodeURIComponent(id),
        {},
        'DELETE',
        base.replace(/\/auth$/, '/admin'),
      );
    },
    async adminUsers(q: Partial<AdminUserQuery> = {}) {
      return adminUserListSchema.parse(await adminGet('/users', q));
    },
    async adminUser(id: string) {
      return adminUserSchema.parse(
        (await adminGet('/users/' + encodeURIComponent(id))).user,
      );
    },
    async createAdminUser(input: AdminUserInput) {
      return adminUserCreatedSchema.parse(await adminWrite('/users', input));
    },
    async updateAdminUser(id: string, input: AdminUserUpdate) {
      return adminUserSchema.parse(
        (await adminWrite('/users/' + encodeURIComponent(id), input, 'PATCH'))
          .user,
      );
    },
    async resetAdminPassword(id: string) {
      const response = await adminWrite(
        '/users/' + encodeURIComponent(id) + '/reset-password',
        {},
      );
      if (
        typeof response?.temporaryPassword !== 'string' ||
        response.temporaryPassword.length < 12
      )
        throw new AuthError(
          0,
          'INVALID_RESPONSE',
          'Não foi possível confirmar a redefinição.',
        );
      return response.temporaryPassword as string;
    },
    async adminCompanies(q: Partial<AdminPageQuery> = {}) {
      return companyListSchema.parse(await adminGet('/companies', q));
    },
    async saveCompany(input: Partial<CompanyInput>, id?: string) {
      return companySchema.parse(
        (
          await adminWrite(
            '/companies' + (id ? '/' + encodeURIComponent(id) : ''),
            input,
            id ? 'PATCH' : 'POST',
          )
        ).item,
      );
    },
    async adminDepartments(
      q: Partial<AdminPageQuery> & { companyId?: string } = {},
    ) {
      return departmentListSchema.parse(await adminGet('/departments', q));
    },
    async saveDepartment(input: Partial<DepartmentInput>, id?: string) {
      return departmentSchema.parse(
        (
          await adminWrite(
            '/departments' + (id ? '/' + encodeURIComponent(id) : ''),
            input,
            id ? 'PATCH' : 'POST',
          )
        ).item,
      );
    },
    async adminSchedules(q: Partial<AdminPageQuery> = {}) {
      return scheduleListSchema.parse(await adminGet('/schedules', q));
    },
    async saveSchedule(input: ScheduleInput | ScheduleUpdate, id?: string) {
      return scheduleSchema.parse(
        (
          await adminWrite(
            '/schedules' + (id ? '/' + encodeURIComponent(id) : ''),
            input,
            id ? 'PATCH' : 'POST',
          )
        ).item,
      );
    },
    async scheduleVersions(id: string, page = 1) {
      return scheduleVersionListSchema.parse(
        await adminGet('/schedules/' + encodeURIComponent(id) + '/versions', {
          page,
          pageSize: 10,
        }),
      );
    },
    async organizationDefault() {
      return organizationDefaultSchema
        .nullable()
        .parse((await adminGet('/organization-default')).settings);
    },
    async setOrganizationDefault(workScheduleId: string) {
      return organizationDefaultSchema.parse(
        (await adminWrite('/organization-default', { workScheduleId }, 'PATCH'))
          .settings,
      );
    },

    async triageTicket(id: string) {
      return triageTicketSchema.parse(
        (await ticketGet('/' + encodeURIComponent(id) + '/triage')).ticket,
      );
    },
    async assignTicket(
      id: string,
      input: {
        technicianId: string;
        expectedPriority: 'LOW' | 'MEDIUM' | 'HIGH';
      },
    ) {
      const target = base.replace(/\/auth$/, '/tickets');
      return assignedTicketSchema.parse(
        (
          await mutate(
            '/' + encodeURIComponent(id) + '/assign',
            input,
            'POST',
            target,
          )
        ).ticket,
      );
    },
    async overview(query: Partial<OverviewQuery> = {}) {
      const search = new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      );
      return overviewListSchema.parse(
        await ticketGet('/overview?' + search.toString()),
      );
    },
    async assignees(query: Partial<AssigneeQuery> = {}) {
      const search = new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      );
      return assigneeListSchema.parse(
        await ticketGet('/assignees?' + search.toString()),
      );
    },
    async startTicket(id: string) {
      const target = base.replace(/\/auth$/, '/tickets');
      // Never retry a possibly committed assignment after transport/5xx/409.
      try {
        return startedTicketSchema.parse(
          (
            await mutate(
              '/' + encodeURIComponent(id) + '/start',
              {},
              'POST',
              target,
            )
          ).ticket,
        );
      } catch (e) {
        if (!(e instanceof AuthError) || e.code !== 'SESSION_INVALID') throw e;
        await refresh();
        return startedTicketSchema.parse(
          (
            await mutate(
              '/' + encodeURIComponent(id) + '/start',
              {},
              'POST',
              target,
            )
          ).ticket,
        );
      }
    },
    async triage(query: Partial<TriageQuery> = {}) {
      const search = new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      );
      return triageListSchema.parse(
        await ticketGet('/triage?' + search.toString()),
      );
    },
    async classifyPriority(id: string, input: ClassifyPriority) {
      const target = base.replace(/\/auth$/, '/tickets');
      // No blind mutation retry after transport errors or conflicts.
      try {
        return triageTicketSchema.parse(
          (
            await mutate(
              '/' + encodeURIComponent(id) + '/priority',
              input,
              'PATCH',
              target,
            )
          ).ticket,
        );
      } catch (e) {
        if (!(e instanceof AuthError) || e.code !== 'SESSION_INVALID') throw e;
        await refresh();
        return triageTicketSchema.parse(
          (
            await mutate(
              '/' + encodeURIComponent(id) + '/priority',
              input,
              'PATCH',
              target,
            )
          ).ticket,
        );
      }
    },
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
    async operationalTicket(id: string) {
      const target = base.replace(/\/auth$/, '/tickets');
      let r = await request(
        '/' + encodeURIComponent(id) + '/operational',
        { credentials: 'include', cache: 'no-store' },
        target,
      );
      if (r.status === 401) {
        await refresh();
        r = await request(
          '/' + encodeURIComponent(id) + '/operational',
          { credentials: 'include', cache: 'no-store' },
          target,
        );
      }
      return overviewListSchema.shape.items.element.parse(
        (await decode(r)).ticket,
      );
    },
    async projectWorkflows(query: Record<string, unknown> = {}) {
      const q = new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== '')
          .map(([k, v]) => [k, String(v)]),
      );
      return projectWorkflowListSchema.parse(
        await projectRead('/workflows?' + q),
      );
    },
    async projectWorkflow(id: string) {
      return projectWorkflowSchema.parse(
        await projectRead('/' + encodeURIComponent(id) + '/workflow'),
      );
    },
    async projectDashboard() {
      return projectDashboardSchema.parse(
        await projectRead('/workflows/dashboard'),
      );
    },
    async projectWorkflowHistory(id: string, page = 1) {
      return projectWorkflowHistorySchema.parse(
        await projectRead(
          '/' + encodeURIComponent(id) + '/workflow/history?page=' + page,
        ),
      );
    },
    async projectWrite(
      id: string,
      operation: string,
      input: object,
      method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
    ) {
      const target = base.replace(/\/auth$/, '/projects');
      const path = '/' + encodeURIComponent(id) + '/' + operation;
      try {
        return projectWorkflowSchema.parse(
          await mutate(path, input, method, target),
        );
      } catch (e) {
        if (!(e instanceof AuthError) || e.code !== 'SESSION_INVALID') throw e;
        await refresh();
        return projectWorkflowSchema.parse(
          await mutate(path, input, method, target),
        );
      }
    },
    async projects(
      query: { page?: number; pageSize?: number; search?: string } = {},
    ) {
      const target = base.replace(/\/auth$/, '/projects');
      const params = new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      );
      let r = await request(
        '?' + params,
        { credentials: 'include', cache: 'no-store' },
        target,
      );
      if (r.status === 401) {
        await refresh();
        r = await request(
          '?' + params,
          { credentials: 'include', cache: 'no-store' },
          target,
        );
      }
      return projectListSchema.parse(await decode(r));
    },
    async project(id: string) {
      const target = base.replace(/\/auth$/, '/projects');
      const read = async (suffix: string) => {
        let r = await request(
          '/' + encodeURIComponent(id) + suffix,
          { credentials: 'include', cache: 'no-store' },
          target,
        );
        if (r.status === 401) {
          await refresh();
          r = await request(
            '/' + encodeURIComponent(id) + suffix,
            { credentials: 'include', cache: 'no-store' },
            target,
          );
        }
        return decode(r);
      };
      const [detail, history] = await Promise.all([read(''), read('/history')]);
      return {
        project: projectRequestSchema.parse(detail.project),
        history: projectHistorySchema.parse(history),
      };
    },
    async requestProject(input: {
      form?: {
        categoryId: string;
        versionId: string;
        answers: Record<string, string | string[] | number | boolean>;
      };
      clientOperationId?: string;
      title: string;
      objective: string;
      need: string;
    }) {
      const payload = {
        ...input,
        clientOperationId: input.clientOperationId ?? crypto.randomUUID(),
      };
      const target = base.replace(/\/auth$/, '/projects');
      try {
        return projectRequestSchema.parse(
          (await mutate('', payload, 'POST', target)).project,
        );
      } catch (e) {
        if (!(e instanceof AuthError) || e.code !== 'SESSION_INVALID') throw e;
        await refresh();
        return projectRequestSchema.parse(
          (await mutate('', input, 'POST', target)).project,
        );
      }
    },
    async personalDashboard() {
      const target = base.replace(/\/auth$/, '/dashboard');
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
      return personalDashboardSchema.parse(await decode(response));
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
