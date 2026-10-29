import { z } from 'zod';
import {
  categoryInputSchema,
  categoryUpdateSchema,
  serviceInputSchema,
  serviceUpdateSchema,
  catalogQuerySchema,
  serviceQuerySchema,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import {
  requirePermission,
  resourceNotFound,
} from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import { CatalogRepository } from './catalog.repository.js';
import type { CatalogKind } from './catalog.repository.js';
const invalid = () =>
  new ApplicationError(
    'INVALID_INPUT',
    400,
    'Revise os campos permitidos do catálogo.',
  );
export class CatalogService {
  constructor(private repo: CatalogRepository) {}
  list(kind: CatalogKind, identity: Identity, input: unknown) {
    requirePermission(
      identity,
      kind === 'categories' ? 'categories.read' : 'services.read',
    );
    const parsed = (
      kind === 'categories' ? catalogQuerySchema : serviceQuerySchema
    ).safeParse(input);
    if (!parsed.success) throw invalid();
    return this.repo.list(kind, identity.user.role === 'ADMIN', parsed.data);
  }
  detail(kind: CatalogKind, identity: Identity, id: unknown) {
    requirePermission(
      identity,
      kind === 'categories' ? 'categories.read' : 'services.read',
    );
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) throw resourceNotFound();
    return this.repo.detail(kind, identity.user.role === 'ADMIN', parsed.data);
  }
  async write(
    kind: CatalogKind,
    identity: Identity,
    input: unknown,
    id?: unknown,
  ) {
    requirePermission(
      identity,
      kind === 'categories'
        ? id === undefined
          ? 'categories.create'
          : 'categories.update'
        : id === undefined
          ? 'services.create'
          : 'services.update',
    );
    const target = id === undefined ? undefined : z.uuid().safeParse(id);
    if (target && !target.success) throw resourceNotFound();
    const schema =
      kind === 'categories'
        ? id === undefined
          ? categoryInputSchema
          : categoryUpdateSchema
        : id === undefined
          ? serviceInputSchema
          : serviceUpdateSchema;
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw invalid();
    try {
      return kind === 'categories'
        ? await this.repo.writeCategory(
            identity,
            categoryUpdateSchema.parse(parsed.data),
            target?.data,
          )
        : await this.repo.writeService(
            identity,
            serviceUpdateSchema.parse(parsed.data),
            target?.data,
          );
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (
        ['P2034', 'P2002', 'P2003'].includes(code ?? '') ||
        ['40001', '40P01', '23503', '23505'].includes(
          databaseErrorCode(error) ?? '',
        )
      )
        throw new ApplicationError(
          'CATALOG_CONFLICT',
          409,
          'O catálogo mudou ou os dados conflitam. Atualize a consulta e tente novamente.',
        );
      throw error;
    }
  }
}
