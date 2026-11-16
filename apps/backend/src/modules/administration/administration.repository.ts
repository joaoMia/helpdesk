import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
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
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import { resourceNotFound } from '../authorization/permissions.js';
import { ApplicationError } from '../../shared/errors.js';
import { containsText } from '../../shared/search.js';
import {
  applicableSchedule,
  switchCalendar,
} from '../calendars/calendar-segments.js';

const conflict = (message: string) =>
  new ApplicationError('ADMIN_CONFLICT', 409, message);
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  username: true,
  companyId: true,
  departmentId: true,
  workScheduleId: true,
  isActive: true,
  mustChangePassword: true,
  createdAt: true,
  updatedAt: true,
  company: { select: { name: true } },
  department: { select: { name: true } },
  workSchedule: { select: { name: true } },
} as const;
const userDto = (u: Prisma.UserGetPayload<{ select: typeof userSelect }>) => {
  const { company, department, workSchedule, ...fields } = u;
  return {
    ...fields,
    companyName: company?.name ?? null,
    departmentName: department?.name ?? null,
    workScheduleName: workSchedule?.name ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
};
export type AdministrativeKind = 'companies' | 'departments' | 'schedules';
export class AdministrationRepository {
  constructor(private db: PrismaClient) {}
  async removeUser(identity: Identity, id: string) {
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, identity);
        await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({ where: { id } });
        if (!user) throw resourceNotFound();
        if (id === identity.user.id)
          throw conflict('Não é possível excluir sua própria conta.');
        if (
          user.role === 'ADMIN' &&
          user.isActive &&
          (await tx.user.count({ where: { role: 'ADMIN', isActive: true } })) <=
            1
        )
          throw conflict('O último administrador ativo deve ser preservado.');
        const refs = await tx.$queryRaw<
          { schema: string; table: string; column: string }[]
        >`SELECT n.nspname AS schema,c.relname AS table,a.attname AS column FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1] WHERE k.contype='f' AND k.confrelid='users'::regclass AND n.nspname=current_schema()`;
        const quote = (v: string) => '"' + v.replaceAll('"', '""') + '"';
        for (const ref of refs) {
          const rows = await tx.$queryRawUnsafe<{ present: number }[]>(
            'SELECT 1 AS present FROM ' +
              quote(ref.schema) +
              '.' +
              quote(ref.table) +
              ' WHERE ' +
              quote(ref.column) +
              '=$1::uuid LIMIT 1',
            id,
          );
          if (rows.length)
            throw conflict(
              'Conta com histórico ou sessões. Utilize Desativar para preservar os registros.',
            );
        }
        await this.audit(tx, identity, 'user', id, 'DELETED', []);
        await tx.user.delete({ where: { id } });
        return { removed: true };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async retire(
    identity: Identity,
    kind: 'ticket' | 'service' | 'category',
    id: string,
    reason: string,
  ) {
    return this.db.$transaction(
      async (tx) => {
        if (identity.user.role === 'ADMIN') await this.actor(tx, identity);
        else {
          if (kind !== 'ticket') throw resourceNotFound();
          await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
          const actor = await tx.user.findUnique({
              where: { id: identity.user.id },
            }),
            session = await tx.authSession.findUnique({
              where: { id: identity.sessionId },
            });
          if (
            !actor ||
            actor.role !== 'TECHNICIAN' ||
            !actor.isActive ||
            actor.mustChangePassword ||
            !session ||
            session.userId !== actor.id ||
            session.revokedAt ||
            session.expiresAt <= new Date()
          )
            throw invalidSession();
        }
        const table = {
          ticket: 'tickets',
          service: 'services',
          category: 'service_categories',
        }[kind];
        const target = await tx.$queryRawUnsafe<{ id: string }[]>(
          'SELECT id FROM "' + table + '" WHERE id=$1::uuid FOR UPDATE',
          id,
        );
        if (!target.length) throw resourceNotFound();
        if (
          identity.user.role === 'TECHNICIAN' &&
          !(await tx.ticket.findFirst({
            where: {
              id,
              assignedTechnicianId: identity.user.id,
            },
          }))
        )
          throw resourceNotFound();
        await tx.operationalRetirement.create({
          data: {
            actorId: identity.user.id,
            reason,
            ...(kind === 'ticket'
              ? { ticketId: id }
              : kind === 'service'
                ? { serviceId: id }
                : { categoryId: id }),
          },
        });
        await this.audit(tx, identity, kind, id, 'RETIRED', []);
        return { removed: true };
      },
      { isolationLevel: 'Serializable' },
    );
  }
  private async actor(tx: Prisma.TransactionClient, identity: Identity) {
    // Serializes role changes/last-admin checks, independently of HTTP preflight.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(2026,400)`;
    await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
    const user = await tx.user.findUnique({ where: { id: identity.user.id } }),
      session = await tx.authSession.findUnique({
        where: { id: identity.sessionId },
      });
    if (
      !user ||
      user.role !== 'ADMIN' ||
      !user.isActive ||
      user.mustChangePassword ||
      !session ||
      session.userId !== user.id ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    )
      throw invalidSession();
    return user;
  }
  private async audit(
    tx: Prisma.TransactionClient,
    identity: Identity,
    resourceType: string,
    resourceId: string,
    action: string,
    fields: string[],
  ) {
    await tx.adminAuditEvent.create({
      data: {
        actorId: identity.user.id,
        resourceType,
        resourceId,
        action,
        details: { fields },
      },
    });
  }
  private async links(
    tx: Prisma.TransactionClient,
    v: {
      companyId?: string | null;
      departmentId?: string | null;
      workScheduleId?: string | null;
    },
  ) {
    if (
      v.companyId &&
      !(await tx.company.findFirst({
        where: { id: v.companyId, isActive: true },
        select: { id: true },
      }))
    )
      throw conflict('Selecione uma empresa ativa.');
    if (
      v.departmentId &&
      (!v.companyId ||
        !(await tx.department.findFirst({
          where: { id: v.departmentId, companyId: v.companyId, isActive: true },
          select: { id: true },
        })))
    )
      throw conflict(
        'O setor precisa estar ativo e pertencer à empresa selecionada.',
      );
    if (
      v.workScheduleId &&
      !(await tx.workSchedule.findFirst({
        where: { id: v.workScheduleId, isActive: true, versions: { some: {} } },
        select: { id: true },
      }))
    )
      throw conflict('Selecione um expediente ativo.');
  }
  users(q: AdminUserQuery, actorId?: string) {
    const where = Prisma.sql`WHERE ${q.role ? Prisma.sql`u.role::text=${q.role}` : Prisma.sql`TRUE`} AND ${q.status === 'all' ? Prisma.sql`TRUE` : Prisma.sql`u.is_active=${q.status === 'active'}`} AND ${q.companyId ? Prisma.sql`u.company_id=${q.companyId}::uuid` : Prisma.sql`TRUE`} AND ${q.departmentId ? Prisma.sql`u.department_id=${q.departmentId}::uuid` : Prisma.sql`TRUE`} AND ${q.search ? Prisma.sql`(${containsText(Prisma.sql`u.name`, q.search)} OR ${containsText(Prisma.sql`u.email`, q.search)} OR ${containsText(Prisma.sql`u.username`, q.search)})` : Prisma.sql`TRUE`}`;
    return this.db.$transaction(
      async (tx) => {
        const ids = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT u.id FROM users u ${where} ORDER BY u.name,u.id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
        );
        const [count] = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM users u ${where}`,
        );
        const refs = await tx.$queryRaw<
          { schema: string; table: string; column: string }[]
        >`SELECT n.nspname AS schema,c.relname AS table,a.attname AS column FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=k.conkey[1] WHERE k.contype='f' AND k.confrelid='users'::regclass AND n.nspname=current_schema()`;
        const quote = (v: string) => '"' + v.replaceAll('"', '""') + '"';
        const seen = ids.length
          ? await tx.$queryRawUnsafe<{ id: string }[]>(
              refs
                .map(
                  (r) =>
                    'SELECT ' +
                    quote(r.column) +
                    ' AS id FROM ' +
                    quote(r.schema) +
                    '.' +
                    quote(r.table) +
                    ' WHERE ' +
                    quote(r.column) +
                    '=ANY($1::uuid[])',
                )
                .join(' UNION '),
              ids.map((r) => r.id),
            )
          : [];
        const linked = new Set(seen.map((r) => r.id));
        const activeAdmins = await tx.user.count({
          where: { role: 'ADMIN', isActive: true },
        });
        return {
          items: (
            await tx.user.findMany({
              where: { id: { in: ids.map((r) => r.id) } },
              select: userSelect,
              orderBy: [{ name: 'asc' }, { id: 'asc' }],
            })
          ).map((u) => {
            const deleteBlockedReason = linked.has(u.id)
              ? 'Há vínculos ou histórico que precisam ser preservados. Desative a conta.'
              : u.id === actorId
                ? 'Sua própria conta administrativa não pode ser excluída.'
                : u.role === 'ADMIN' && u.isActive && activeAdmins <= 1
                  ? 'O último administrador ativo deve ser preservado.'
                  : null;
            return {
              ...userDto(u),
              canDelete: deleteBlockedReason === null,
              deleteBlockedReason,
            };
          }),
          total: Number(count?.total ?? 0n),
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async user(id: string) {
    const row = await this.db.user.findUnique({
      where: { id },
      select: userSelect,
    });
    if (!row) throw resourceNotFound();
    return userDto(row);
  }
  createUser(identity: Identity, input: AdminUserInput, passwordHash: string) {
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, identity);
        await this.links(tx, input);
        const user = await tx.user.create({
          data: {
            ...input,
            passwordHash,
            isActive: true,
            mustChangePassword: true,
          },
          select: userSelect,
        });
        await this.audit(
          tx,
          identity,
          'user',
          user.id,
          'CREATED',
          Object.keys(input),
        );
        return userDto(user);
      },
      { isolationLevel: 'Serializable' },
    );
  }
  updateUser(identity: Identity, id: string, input: AdminUserUpdate) {
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, identity);
        await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
        const old = await tx.user.findUnique({ where: { id } });
        if (!old) throw resourceNotFound();
        if (
          old.role === 'ADMIN' &&
          old.isActive &&
          ((input.role && input.role !== 'ADMIN') ||
            input.isActive === false) &&
          (await tx.user.count({ where: { role: 'ADMIN', isActive: true } })) <=
            1
        )
          throw conflict('O último administrador ativo deve ser preservado.');
        if (
          old.role === 'TECHNICIAN' &&
          ((input.role && input.role !== 'TECHNICIAN') ||
            input.isActive === false) &&
          (await tx.ticket.count({
            where: { assignedTechnicianId: id, status: { not: 'CLOSED' } },
          }))
        )
          throw conflict(
            'Há chamados ativos atribuídos. Preserve o responsável até concluir os atendimentos.',
          );
        const companyChanged =
            input.companyId !== undefined && input.companyId !== old.companyId,
          departmentChanged =
            input.departmentId !== undefined &&
            input.departmentId !== old.departmentId;
        if (companyChanged || departmentChanged)
          await this.links(tx, {
            companyId:
              input.companyId === undefined ? old.companyId : input.companyId,
            departmentId:
              input.departmentId === undefined
                ? old.departmentId
                : input.departmentId,
          });
        if (
          input.workScheduleId !== undefined &&
          input.workScheduleId !== old.workScheduleId
        )
          await this.links(tx, { workScheduleId: input.workScheduleId });
        const now = new Date(),
          user = await tx.user.update({
            where: { id },
            data: input,
            select: userSelect,
          });
        const sensitive = [
          'email',
          'role',
          'isActive',
          'companyId',
          'departmentId',
          'workScheduleId',
        ] as const;
        if (
          sensitive.some(
            (key) => input[key] !== undefined && input[key] !== old[key],
          )
        )
          await tx.authSession.updateMany({
            where: { userId: id, revokedAt: null },
            data: { revokedAt: now, revokeReason: 'ADMIN_PROFILE_CHANGED' },
          });
        if (
          (input.workScheduleId !== undefined &&
            input.workScheduleId !== old.workScheduleId) ||
          (input.companyId !== undefined && input.companyId !== old.companyId)
        ) {
          const version = await applicableSchedule(tx, id, true);
          const tickets = await tx.ticket.findMany({
            where: {
              assignedTechnicianId: id,
              firstStartedAt: { not: null },
              status: { not: 'CLOSED' },
            },
            select: { id: true },
            orderBy: { id: 'asc' },
          });
          for (const ticket of tickets)
            await switchCalendar(
              tx,
              ticket.id,
              version?.id ?? null,
              now,
              identity.user.id,
            );
        }
        await this.audit(
          tx,
          identity,
          'user',
          id,
          'UPDATED',
          Object.keys(input),
        );
        return userDto(user);
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }
  resetPassword(identity: Identity, id: string, passwordHash: string) {
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, identity);
        if (id === identity.user.id)
          throw conflict('Para sua própria conta, use Alterar senha.');
        await tx.$queryRaw`SELECT id FROM users WHERE id=${id}::uuid FOR UPDATE`;
        if (
          !(await tx.user.findUnique({ where: { id }, select: { id: true } }))
        )
          throw resourceNotFound();
        await tx.user.update({
          where: { id },
          data: { passwordHash, mustChangePassword: true },
        });
        await tx.authSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: 'ADMIN_PASSWORD_RESET' },
        });
        await this.audit(tx, identity, 'user', id, 'PASSWORD_RESET', []);
      },
      { isolationLevel: 'Serializable' },
    );
  }
  async list(
    kind: AdministrativeKind,
    q: AdminPageQuery & { companyId?: string; id?: string },
  ) {
    const table =
      kind === 'companies'
        ? Prisma.sql`companies`
        : kind === 'departments'
          ? Prisma.sql`departments`
          : Prisma.sql`work_schedules`;
    const filter = Prisma.sql`WHERE ${q.id ? Prisma.sql`e.id=${q.id}::uuid` : Prisma.sql`TRUE`} AND ${q.status === 'all' ? Prisma.sql`TRUE` : Prisma.sql`e.is_active=${q.status === 'active'}`} AND ${q.search ? containsText(Prisma.sql`e.name`, q.search) : Prisma.sql`TRUE`} AND ${kind === 'departments' && q.companyId ? Prisma.sql`e.company_id=${q.companyId}::uuid` : Prisma.sql`TRUE`}`;
    return this.db.$transaction(
      async (tx) => {
        const ids = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT e.id FROM ${table} e ${filter} ORDER BY e.name,e.id LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
        );
        const [count] = await tx.$queryRaw<{ total: bigint }[]>(
          Prisma.sql`SELECT count(*) AS total FROM ${table} e ${filter}`,
        );
        const where = { id: { in: ids.map((i) => i.id) } },
          paging = {
            orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }],
          },
          page = {
            total: Number(count?.total ?? 0n),
            page: q.page,
            pageSize: q.pageSize,
          };
        if (kind === 'companies') {
          const rows = await tx.company.findMany({
            where,
            include: { _count: { select: { users: true } } },
            ...paging,
          });
          return {
            items: rows.map(({ _count, ...r }) => ({
              ...r,
              userCount: _count.users,
              createdAt: r.createdAt.toISOString(),
              updatedAt: r.updatedAt.toISOString(),
            })),
            ...page,
          };
        }
        if (kind === 'departments') {
          const rows = await tx.department.findMany({
            where,
            include: {
              company: { select: { name: true } },
              _count: { select: { users: true } },
            },
            ...paging,
          });
          return {
            items: rows.map(({ _count, company, ...r }) => ({
              ...r,
              companyName: company.name,
              userCount: _count.users,
              createdAt: r.createdAt.toISOString(),
              updatedAt: r.updatedAt.toISOString(),
            })),
            ...page,
          };
        }
        const rows = await tx.workSchedule.findMany({
          where,
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
          ...paging,
        });
        return {
          items: rows.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            versions: r.versions.map((v) => ({
              id: v.id,
              version: v.version,
              timezone: v.timezone,
              weekly: v.weekly,
              exceptions: v.exceptions,
              createdAt: v.createdAt.toISOString(),
            })),
          })),
          ...page,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  company(
    identity: Identity,
    id: string | undefined,
    input: Partial<CompanyInput>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, identity);
        if (input.workScheduleId)
          await this.links(tx, { workScheduleId: input.workScheduleId });
        if (
          id &&
          !(await tx.company.findUnique({
            where: { id },
            select: { id: true },
          }))
        )
          throw resourceNotFound();
        const row = id
          ? await tx.company.update({ where: { id }, data: input })
          : await tx.company.create({ data: input as CompanyInput });
        if (id && input.workScheduleId !== undefined) {
          const fallback = await tx.organizationSettings.findUnique({
              where: { id: 'organization' },
            }),
            scheduleId = row.workScheduleId ?? fallback?.workScheduleId;
          const version = scheduleId
            ? await tx.workScheduleVersion.findFirst({
                where: { scheduleId, schedule: { isActive: true } },
                orderBy: { version: 'desc' },
              })
            : null;
          const targets = await tx.ticket.findMany({
            where: {
              status: { not: 'CLOSED' },
              OR: [
                {
                  firstStartedAt: null,
                  organizationSnapshot: { path: ['companyId'], equals: row.id },
                },
                {
                  firstStartedAt: { not: null },
                  assignedTechnician: {
                    is: { companyId: row.id, workScheduleId: null },
                  },
                },
              ],
            },
            select: { id: true },
            orderBy: { id: 'asc' },
          });
          const now = new Date();
          for (const t of targets)
            await switchCalendar(
              tx,
              t.id,
              version?.id ?? null,
              now,
              identity.user.id,
            );
        }
        await this.audit(
          tx,
          identity,
          'company',
          row.id,
          id ? 'UPDATED' : 'CREATED',
          Object.keys(input),
        );
        return row.id;
      },
      { isolationLevel: 'Serializable' },
    );
  }
  department(
    identity: Identity,
    id: string | undefined,
    input: Partial<DepartmentInput>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, identity);
        const old = id
          ? await tx.department.findUnique({ where: { id } })
          : null;
        if (id && !old) throw resourceNotFound();
        if (
          !old ||
          (input.companyId !== undefined && input.companyId !== old.companyId)
        )
          await this.links(tx, {
            companyId: input.companyId ?? old?.companyId,
          });
        if (
          old &&
          input.companyId &&
          input.companyId !== old.companyId &&
          (await tx.user.count({ where: { departmentId: id } }))
        )
          throw conflict(
            'Setor com usuários vinculados não pode mudar de empresa.',
          );
        const row = id
          ? await tx.department.update({ where: { id }, data: input })
          : await tx.department.create({ data: input as DepartmentInput });
        await this.audit(
          tx,
          identity,
          'department',
          row.id,
          id ? 'UPDATED' : 'CREATED',
          Object.keys(input),
        );
        return row.id;
      },
      { isolationLevel: 'Serializable' },
    );
  }
  schedule(
    identity: Identity,
    id: string | undefined,
    input: ScheduleInput | ScheduleUpdate,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, identity);
        if (input.timezone) {
          const [zone] = await tx.$queryRaw<
            { valid: boolean }[]
          >`SELECT EXISTS(SELECT 1 FROM pg_timezone_names WHERE lower(name)=lower(${input.timezone})) AS valid`;
          if (!zone?.valid)
            throw conflict('O fuso horário não está disponível no PostgreSQL.');
        }
        if (id)
          await tx.$queryRaw`SELECT id FROM work_schedules WHERE id=${id}::uuid FOR UPDATE`;
        const old = id
          ? await tx.workSchedule.findUnique({
              where: { id },
              include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
            })
          : null;
        if (id && !old) throw resourceNotFound();
        const row = id
          ? await tx.workSchedule.update({
              where: { id },
              data: {
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.isActive !== undefined
                  ? { isActive: input.isActive }
                  : {}),
              },
            })
          : await tx.workSchedule.create({
              data: { name: input.name!, isActive: input.isActive ?? true },
            });
        if (
          !old ||
          input.weekly !== undefined ||
          input.timezone !== undefined ||
          input.exceptions !== undefined
        ) {
          const previous = old?.versions[0],
            now = new Date();
          const version = await tx.workScheduleVersion.create({
            data: {
              scheduleId: row.id,
              version: (previous?.version ?? 0) + 1,
              timezone: input.timezone ?? previous!.timezone,
              weekly: (input.weekly ??
                previous!.weekly) as Prisma.InputJsonValue,
              exceptions: (input.exceptions ??
                previous?.exceptions ??
                []) as Prisma.InputJsonValue,
              createdAt: now,
            },
          });
          const active = await tx.ticketCalendarSegment.findMany({
            where: {
              endsAt: null,
              version: { scheduleId: row.id },
              ticket: { status: { not: 'CLOSED' } },
            },
            select: { ticketId: true },
            orderBy: { ticketId: 'asc' },
          });
          for (const t of active)
            await switchCalendar(
              tx,
              t.ticketId,
              version.id,
              now,
              identity.user.id,
            );
        }
        await this.audit(
          tx,
          identity,
          'schedule',
          row.id,
          id ? 'VERSIONED' : 'CREATED',
          Object.keys(input),
        );
        return row.id;
      },
      { isolationLevel: 'Serializable', timeout: 20000 },
    );
  }
  async defaults() {
    return this.db.organizationSettings.findUnique({
      where: { id: 'organization' },
      select: { workScheduleId: true },
    });
  }
  async versions(id: string, page: number, pageSize: number) {
    if (
      !(await this.db.workSchedule.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      throw resourceNotFound();
    return this.db.$transaction(
      async (tx) => ({
        items: (
          await tx.workScheduleVersion.findMany({
            where: { scheduleId: id },
            orderBy: { version: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
          })
        ).map((v) => ({
          id: v.id,
          version: v.version,
          timezone: v.timezone,
          weekly: v.weekly,
          exceptions: v.exceptions,
          createdAt: v.createdAt.toISOString(),
        })),
        total: await tx.workScheduleVersion.count({
          where: { scheduleId: id },
        }),
        page,
        pageSize,
      }),
      { isolationLevel: 'RepeatableRead' },
    );
  }
  setDefault(identity: Identity, workScheduleId: string) {
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, identity);
        await this.links(tx, { workScheduleId });
        await tx.organizationSettings.upsert({
          where: { id: 'organization' },
          create: { id: 'organization', workScheduleId },
          update: { workScheduleId },
        });
        const version = await tx.workScheduleVersion.findFirst({
          where: { scheduleId: workScheduleId },
          orderBy: { version: 'desc' },
        });
        const targets = await tx.$queryRaw<
          { id: string }[]
        >`SELECT t.id FROM tickets t LEFT JOIN users u ON u.id=t.assigned_technician_id LEFT JOIN companies c ON c.id::text=CASE WHEN t.first_started_at IS NULL THEN t.organization_snapshot->>'companyId' ELSE u.company_id::text END WHERE t.status<>'CLOSED' AND c.work_schedule_id IS NULL AND (t.first_started_at IS NULL OR u.work_schedule_id IS NULL) ORDER BY t.id`;
        const now = new Date();
        for (const t of targets)
          await switchCalendar(
            tx,
            t.id,
            version?.id ?? null,
            now,
            identity.user.id,
          );
        await this.audit(
          tx,
          identity,
          'schedule',
          workScheduleId,
          'ORGANIZATION_DEFAULT',
          [],
        );
        return { workScheduleId };
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
