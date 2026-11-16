import { personalDashboardSchema } from '@helpdesk/contracts';
import { PersonalDashboardRepository } from './personal-dashboard.repository.js';
import { z } from 'zod';
import {
  adminPageQuerySchema,
  pendingReasonInputSchema,
  pendingReasonUpdateSchema,
  pendingInputSchema,
  emptyOperationSchema,
  slaPolicyInputSchema,
  ticketMetricsSchema,
  pendingReasonListSchema,
  slaPolicyListSchema,
  dashboardQuerySchema,
  dashboardSchema,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import {
  requirePermission,
  resourceNotFound,
} from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import {
  LifecycleRepository,
  lifecycleConflict,
} from './lifecycle.repository.js';
import { DashboardRepository } from './dashboard.repository.js';
const parse = <T>(s: z.ZodType<T>, v: unknown): T => {
  const r = s.safeParse(v);
  if (!r.success)
    throw new ApplicationError(
      'INVALID_INPUT',
      400,
      'Revise os campos e filtros permitidos.',
    );
  return r.data;
};
const target = (id: unknown) => {
  const r = z.uuid().safeParse(id);
  if (!r.success) throw resourceNotFound();
  return r.data;
};
export class LifecycleService {
  constructor(
    private repo: LifecycleRepository,
    private dashboardRepo = new DashboardRepository(repo.db),
  ) {}
  private async write<T>(op: () => Promise<T>) {
    try {
      return await op();
    } catch (e) {
      if (
        ['P2034', 'P2002'].includes(String((e as { code?: string }).code)) ||
        ['40001', '40P01', '23505'].includes(databaseErrorCode(e) ?? '')
      )
        throw lifecycleConflict(
          'Outra operação modificou os dados. Atualize antes de tentar novamente.',
        );
      throw e;
    }
  }
  metrics(identity: Identity, id: unknown, query: unknown) {
    requirePermission(identity, 'tickets.read');
    parse(emptyOperationSchema, query);
    return this.repo
      .read(identity, target(id))
      .then((r) => ticketMetricsSchema.parse(r));
  }
  transition(
    identity: Identity,
    id: unknown,
    op: 'pause' | 'resume' | 'close',
    input: unknown,
  ) {
    requirePermission(
      identity,
      op === 'pause'
        ? 'tickets.pause'
        : op === 'resume'
          ? 'tickets.resume'
          : 'tickets.close',
    );
    const v =
      op === 'pause'
        ? parse(pendingInputSchema, input)
        : parse(emptyOperationSchema, input);
    return this.write(() => this.repo.write(identity, target(id), op, v));
  }
  reasons(identity: Identity, query: unknown) {
    requirePermission(identity, 'pending-reasons.read');
    const q = parse(adminPageQuerySchema, query);
    return this.repo
      .reasons(q, identity.user.role === 'ADMIN')
      .then((r) => pendingReasonListSchema.parse(r));
  }
  policies(identity: Identity, query: unknown) {
    requirePermission(identity, 'administration.manage');
    const q = parse(
      adminPageQuerySchema.pick({ page: true, pageSize: true }),
      query,
    );
    return this.repo
      .policies(q.page, q.pageSize)
      .then((r) => slaPolicyListSchema.parse(r));
  }
  saveReason(identity: Identity, id: unknown, input: unknown) {
    requirePermission(identity, 'administration.manage');
    const v =
      id === undefined
        ? parse(pendingReasonInputSchema, input)
        : parse(pendingReasonUpdateSchema, input);
    return this.write(() =>
      this.repo.adminWrite(
        identity,
        'reason',
        id === undefined ? undefined : target(id),
        v,
      ),
    );
  }
  savePolicy(identity: Identity, input: unknown) {
    requirePermission(identity, 'administration.manage');
    return this.write(() =>
      this.repo.adminWrite(
        identity,
        'policy',
        undefined,
        parse(slaPolicyInputSchema, input),
      ),
    );
  }
  personalDashboard(identity: Identity, query: unknown) {
    requirePermission(identity, 'dashboard.personal');
    parse(emptyOperationSchema, query);
    return new PersonalDashboardRepository(this.repo.db)
      .read(identity)
      .then((r) => personalDashboardSchema.parse(r));
  }
  dashboard(identity: Identity, query: unknown) {
    requirePermission(identity, 'dashboard.read');
    const q = parse(dashboardQuerySchema, query),
      to = q.to ?? new Date().toISOString().slice(0, 10),
      from =
        q.from ??
        new Date(Date.parse(to) - 89 * 86400000).toISOString().slice(0, 10);
    parse(dashboardQuerySchema, { ...q, from, to });
    return this.dashboardRepo
      .read({ ...q, from, to })
      .then((r) => dashboardSchema.parse(r));
  }
}
