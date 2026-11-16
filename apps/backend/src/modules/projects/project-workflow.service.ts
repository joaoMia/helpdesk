import { z } from 'zod';
import {
  projectPlanVersionsSchema,
  projectPublishedPlanSchema,
  projectWorkflowSchema,
  projectWorkflowListSchema,
  projectDashboardSchema,
  projectUpdatesSchema,
  projectWorkflowHistorySchema,
  projectWorkflowQuerySchema,
  projectHistoryQuerySchema,
  projectMutationSchema,
  projectAssignmentSchema,
  projectReasonSchema,
  projectDraftSchema,
  projectActivitySchema,
  projectUpdateSchema,
  projectPrioritySchema,
  projectRetireSchema,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import {
  requirePermission,
  resourceNotFound,
} from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import {
  ProjectWorkflowRepository,
  projectConflict,
} from './project-workflow.repository.js';
function parse<T>(schema: z.ZodType<T>, v: unknown) {
  const r = schema.safeParse(v);
  if (!r.success)
    throw new ApplicationError(
      'INVALID_INPUT',
      400,
      'Revise os campos, ordens, limites e parâmetros permitidos.',
    );
  return r.data;
}
function id(v: unknown) {
  const r = z.uuid().safeParse(v);
  if (!r.success) throw resourceNotFound();
  return r.data;
}
export class ProjectWorkflowService {
  constructor(private repo: ProjectWorkflowRepository) {}
  async read(i: Identity, key: unknown, q: unknown) {
    requirePermission(i, 'projects.workflow-read');
    parse(z.strictObject({}), q);
    return projectWorkflowSchema.parse(await this.repo.read(i, id(key)));
  }
  async list(i: Identity, q: unknown) {
    requirePermission(i, 'projects.workflow-read');
    return projectWorkflowListSchema.parse(
      await this.repo.list(i, parse(projectWorkflowQuerySchema, q)),
    );
  }
  async dashboard(i: Identity, q: unknown) {
    requirePermission(i, 'projects.workflow-read');
    parse(z.strictObject({}), q);
    return projectDashboardSchema.parse(await this.repo.dashboard(i));
  }
  async history(i: Identity, key: unknown, q: unknown, updates = false) {
    requirePermission(i, 'projects.workflow-read');
    const v = await this.repo.history(
      i,
      id(key),
      parse(projectHistoryQuerySchema, q),
      updates,
    );
    return (
      updates ? projectUpdatesSchema : projectWorkflowHistorySchema
    ).parse(v);
  }
  async versions(i: Identity, key: unknown, q: unknown) {
    requirePermission(i, 'projects.workflow-read');
    return projectPlanVersionsSchema.parse(
      await this.repo.versions(i, id(key), parse(projectHistoryQuerySchema, q)),
    );
  }
  async version(i: Identity, key: unknown, version: unknown, q: unknown) {
    requirePermission(i, 'projects.workflow-read');
    parse(z.strictObject({}), q);
    return projectPublishedPlanSchema.parse(
      await this.repo.read(
        i,
        id(key),
        parse(z.coerce.number().int().positive(), version),
      ),
    );
  }
  async write(
    i: Identity,
    key: unknown,
    op: string,
    body: unknown,
    q: unknown,
    activity?: unknown,
  ) {
    requirePermission(
      i,
      op === 'priority'
        ? 'projects.plan'
        : op === 'retire'
          ? 'projects.retire'
          : op === 'assignment'
            ? 'projects.assign'
            : op === 'cancel'
              ? 'projects.cancel'
              : op === 'draft' || op === 'publish'
                ? 'projects.plan'
                : op === 'update'
                  ? 'projects.update'
                  : 'projects.transition',
    );
    parse(z.strictObject({}), q);
    const schema =
      op === 'priority'
        ? projectPrioritySchema
        : op === 'retire'
          ? projectRetireSchema
          : op === 'draft-delete'
            ? projectMutationSchema
            : op === 'assignment'
              ? projectAssignmentSchema
              : op === 'draft'
                ? projectDraftSchema
                : op === 'activity'
                  ? projectActivitySchema
                  : op === 'stage-complete'
                    ? projectMutationSchema
                    : op === 'update'
                      ? projectUpdateSchema
                      : op === 'start'
                        ? projectMutationSchema
                        : projectReasonSchema;
    const value = parse(schema, body);
    try {
      return projectWorkflowSchema.parse(
        await this.repo.mutate(
          i,
          id(key),
          op,
          value,
          activity === undefined ? undefined : id(activity),
        ),
      );
    } catch (e) {
      if (
        ['P2034', 'P2002'].includes((e as { code?: string }).code ?? '') ||
        ['40001', '40P01', '23505'].includes(databaseErrorCode(e) ?? '')
      )
        throw projectConflict();
      throw e;
    }
  }
}
