import { z } from 'zod';
import {
  createProjectSchema,
  projectRequestSchema,
  projectQuerySchema,
  projectListSchema,
  projectHistorySchema,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import {
  requirePermission,
  resourceNotFound,
} from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import { ProjectRepository } from './project.repository.js';
const parse = <T>(schema: z.ZodType<T>, input: unknown) => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError(
      'INVALID_INPUT',
      400,
      'Revise os campos obrigatórios e os filtros permitidos.',
    );
  return result.data;
};
const identifier = (id: unknown) => {
  const result = z.uuid().safeParse(id);
  if (!result.success) throw resourceNotFound();
  return result.data;
};
export class ProjectService {
  constructor(readonly repo: ProjectRepository) {}
  async list(identity: Identity, query: unknown) {
    requirePermission(identity, 'projects.read');
    const result = await this.repo.list(
      identity,
      parse(projectQuerySchema, query),
    );
    return projectListSchema.parse({
      ...result,
      items: result.items.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  }
  async detail(identity: Identity, id: unknown, query: unknown) {
    requirePermission(identity, 'projects.read');
    parse(z.strictObject({}), query);
    const r = await this.repo.detail(identity, identifier(id));
    return projectRequestSchema.parse({
      ...r,
      createdAt: r.createdAt.toISOString(),
    });
  }
  async history(identity: Identity, id: unknown, query: unknown) {
    requirePermission(identity, 'projects.read');
    parse(z.strictObject({}), query);
    const rows = await this.repo.history(identity, identifier(id));
    return projectHistorySchema.parse({
      items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    });
  }
  async create(identity: Identity, input: unknown) {
    requirePermission(identity, 'projects.request');
    const data = parse(createProjectSchema, input);
    try {
      const result = await this.repo.create(identity, data);
      return projectRequestSchema.parse({
        ...result,
        createdAt: result.createdAt,
      });
    } catch (e) {
      if (
        (e as { code?: string }).code === 'P2034' ||
        ['40001', '40P01'].includes(databaseErrorCode(e) ?? '')
      )
        throw new ApplicationError(
          'PROJECT_CONFLICT',
          409,
          'Os dados foram alterados durante a operação. Confira suas solicitações antes de reenviar.',
        );
      throw e;
    }
  }
}
