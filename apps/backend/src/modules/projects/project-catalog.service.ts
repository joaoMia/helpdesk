import { z } from 'zod';
import {
  projectCategoryInputSchema,
  saveFormDraftSchema,
  publishFormDraftSchema,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import {
  requirePermission,
  forbidden,
  resourceNotFound,
} from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import { ProjectCatalogRepository } from './project-catalog.repository.js';
import { projectConflict } from './project-workflow.repository.js';
function parse<T>(s: z.ZodType<T>, v: unknown) {
  const r = s.safeParse(v);
  if (!r.success)
    throw new ApplicationError(
      'INVALID_FORM',
      400,
      'Revise campos, opções, condições e parâmetros permitidos.',
    );
  return r.data;
}
function id(v: unknown) {
  const r = z.uuid().safeParse(v);
  if (!r.success) throw resourceNotFound();
  return r.data;
}
export class ProjectCatalogService {
  constructor(readonly repo: ProjectCatalogRepository) {}
  async run(
    i: Identity,
    op: string,
    key: unknown,
    body: unknown,
    query: unknown,
  ) {
    requirePermission(i, 'projects.workflow-read');
    if (!['list', 'form', 'submission'].includes(op) && i.user.role !== 'ADMIN')
      throw forbidden();
    const q = parse(
      z.strictObject({
        version: z.coerce.number().int().positive().optional(),
      }),
      query,
    );
    if (q.version && (op !== 'form' || i.user.role !== 'ADMIN'))
      throw forbidden();
    try {
      if (op === 'list') return await this.repo.list(i);
      if (op === 'form') return await this.repo.form(i, id(key), q.version);
      if (op === 'submission') return await this.repo.submission(i, id(key));
      if (op === 'bootstrap') {
        parse(z.strictObject({}), body);
        return await this.repo.bootstrap(i);
      }
      if (op === 'create' || op === 'change')
        return await this.repo.change(
          i,
          op === 'create' ? null : id(key),
          parse(projectCategoryInputSchema, body),
        );
      if (op === 'save') {
        const v = parse(saveFormDraftSchema, body);
        return await this.repo.write(
          i,
          id(key),
          v.expectedRevision,
          v.definition,
        );
      }
      if (op === 'publish') {
        const v = parse(publishFormDraftSchema, body);
        return await this.repo.write(i, id(key), v.expectedRevision);
      }
      throw resourceNotFound();
    } catch (e) {
      if (['23505', '40001', '40P01'].includes(databaseErrorCode(e) ?? ''))
        throw projectConflict(
          'Categoria ou formulário alterado por outra operação. Atualize a consulta.',
        );
      throw e;
    }
  }
}
