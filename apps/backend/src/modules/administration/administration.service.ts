import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  adminPageQuerySchema,
  adminUserQuerySchema,
  departmentQuerySchema,
  adminUserInputSchema,
  adminUserUpdateSchema,
  companyInputSchema,
  companyUpdateSchema,
  departmentInputSchema,
  departmentUpdateSchema,
  scheduleInputSchema,
  scheduleUpdateSchema,
  organizationDefaultSchema,
  adminUserSchema,
  adminUserListSchema,
  companyListSchema,
  departmentListSchema,
  scheduleListSchema,
  companySchema,
  departmentSchema,
  scheduleSchema,
  scheduleVersionListSchema,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import { hashPassword } from '../auth/password.js';
import {
  requirePermission,
  resourceNotFound,
} from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import { AdministrationRepository } from './administration.repository.js';
import type { AdministrativeKind } from './administration.repository.js';
const invalid = () =>
  new ApplicationError(
    'INVALID_INPUT',
    400,
    'Revise os campos, vínculos e intervalos permitidos.',
  );
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success) throw invalid();
  return result.data;
};
export class AdministrationService {
  constructor(private repo: AdministrationRepository) {}
  private allowed(identity: Identity) {
    requirePermission(identity, 'administration.manage');
  }
  private async write<T>(op: () => Promise<T>) {
    try {
      return await op();
    } catch (e) {
      if (
        (e as { code?: string })?.code === 'P2002' ||
        databaseErrorCode(e) === '23505'
      )
        throw new ApplicationError(
          'ADMIN_CONFLICT',
          409,
          'Os identificadores informados não estão disponíveis. Revise os dados.',
        );
      if (
        (e as { code?: string })?.code === 'P2034' ||
        ['40001', '40P01'].includes(databaseErrorCode(e) ?? '')
      )
        throw new ApplicationError(
          'ADMIN_CONFLICT',
          409,
          'Os dados foram alterados por outra operação. Atualize antes de tentar novamente.',
        );
      throw e;
    }
  }
  async removeUser(identity: Identity, id: unknown, input: unknown) {
    this.allowed(identity);
    parse(z.strictObject({}), input);
    try {
      return await this.write(() =>
        this.repo.removeUser(identity, parse(z.uuid(), id)),
      );
    } catch (e) {
      if (['P2003', 'P2014'].includes((e as { code?: string }).code ?? ''))
        throw new ApplicationError(
          'ADMIN_CONFLICT',
          409,
          'Conta com histórico. Utilize Desativar.',
        );
      throw e;
    }
  }
  async retire(identity: Identity, input: unknown) {
    this.allowed(identity);
    const v = parse(
      z.strictObject({
        kind: z.enum(['ticket', 'service', 'category']),
        id: z.uuid(),
        reason: z.string().trim().min(3).max(1000),
      }),
      input,
    );
    return this.write(() => this.repo.retire(identity, v.kind, v.id, v.reason));
  }
  users(identity: Identity, input: unknown) {
    this.allowed(identity);
    return this.repo
      .users(parse(adminUserQuerySchema, input), identity.user.id)
      .then((r) => adminUserListSchema.parse(r));
  }
  user(identity: Identity, id: unknown) {
    this.allowed(identity);
    return this.repo
      .user(parse(z.uuid(), id))
      .then((r) => adminUserSchema.parse(r));
  }
  async createUser(identity: Identity, input: unknown) {
    this.allowed(identity);
    const data = parse(adminUserInputSchema, input),
      temporaryPassword = randomBytes(24).toString('base64url'),
      passwordHash = await hashPassword(temporaryPassword);
    const user = await this.write(() =>
      this.repo.createUser(identity, data, passwordHash),
    );
    return { user: adminUserSchema.parse(user), temporaryPassword };
  }
  async updateUser(identity: Identity, id: unknown, input: unknown) {
    this.allowed(identity);
    return adminUserSchema.parse(
      await this.write(() =>
        this.repo.updateUser(
          identity,
          parse(z.uuid(), id),
          parse(adminUserUpdateSchema, input),
        ),
      ),
    );
  }
  async resetPassword(identity: Identity, id: unknown, input: unknown) {
    this.allowed(identity);
    parse(z.strictObject({}), input);
    const temporaryPassword = randomBytes(24).toString('base64url');
    const hash = await hashPassword(temporaryPassword);
    await this.write(() =>
      this.repo.resetPassword(identity, parse(z.uuid(), id), hash),
    );
    return { temporaryPassword };
  }
  async list(kind: AdministrativeKind, identity: Identity, input: unknown) {
    this.allowed(identity);
    const q =
      kind === 'departments'
        ? parse(departmentQuerySchema, input)
        : parse(adminPageQuerySchema, input);
    const result = await this.repo.list(kind, q);
    return (
      kind === 'companies'
        ? companyListSchema
        : kind === 'departments'
          ? departmentListSchema
          : scheduleListSchema
    ).parse(result);
  }
  async detail(kind: AdministrativeKind, identity: Identity, id: unknown) {
    this.allowed(identity);
    const target = parse(z.uuid(), id);
    const result = await this.repo.list(kind, {
      page: 1,
      pageSize: 1,
      search: '',
      status: 'all',
      id: target,
    });
    const item = result.items[0];
    if (!item) throw resourceNotFound();
    return (
      kind === 'companies'
        ? companySchema
        : kind === 'departments'
          ? departmentSchema
          : scheduleSchema
    ).parse(item);
  }
  async save(
    kind: AdministrativeKind,
    identity: Identity,
    id: unknown,
    input: unknown,
  ) {
    this.allowed(identity);
    const target = id === undefined ? undefined : parse(z.uuid(), id);
    const result = await this.write(async () => {
      if (kind === 'companies')
        return this.repo.company(
          identity,
          target,
          target
            ? parse(companyUpdateSchema, input)
            : parse(companyInputSchema, input),
        );
      if (kind === 'departments')
        return this.repo.department(
          identity,
          target,
          target
            ? parse(departmentUpdateSchema, input)
            : parse(departmentInputSchema, input),
        );
      return this.repo.schedule(
        identity,
        target,
        target
          ? parse(scheduleUpdateSchema, input)
          : parse(scheduleInputSchema, input),
      );
    });
    return this.detail(kind, identity, result);
  }
  defaults(identity: Identity) {
    this.allowed(identity);
    return this.repo.defaults();
  }
  versions(identity: Identity, id: unknown, input: unknown) {
    this.allowed(identity);
    const q = parse(
      adminPageQuerySchema.pick({ page: true, pageSize: true }),
      input,
    );
    return this.repo
      .versions(parse(z.uuid(), id), q.page, q.pageSize)
      .then((result) => scheduleVersionListSchema.parse(result));
  }
  setDefault(identity: Identity, input: unknown) {
    this.allowed(identity);
    const q = parse(organizationDefaultSchema, input);
    return this.write(() => this.repo.setDefault(identity, q.workScheduleId));
  }
}
