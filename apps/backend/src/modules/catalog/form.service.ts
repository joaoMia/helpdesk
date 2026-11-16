import { z } from 'zod';
import {
  saveFormDraftSchema,
  publishFormDraftSchema,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import {
  requirePermission,
  resourceNotFound,
} from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import { FormRepository } from './form.repository.js';
export class FormService {
  constructor(private repo: FormRepository) {}
  private id(value: unknown) {
    const r = z.uuid().safeParse(value);
    if (!r.success) throw resourceNotFound();
    return r.data;
  }
  read(identity: Identity, id: unknown, input: unknown) {
    requirePermission(identity, 'services.read');
    const q = z
      .strictObject({
        version: z.coerce.number().int().positive().max(2147483647).optional(),
      })
      .safeParse(input);
    if (!q.success || (q.data.version && identity.user.role !== 'ADMIN'))
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Consulta de versão não permitida.',
      );
    return this.repo.read(identity, this.id(id), q.data.version);
  }
  async write(
    identity: Identity,
    id: unknown,
    input: unknown,
    publish = false,
  ) {
    requirePermission(identity, 'services.update');
    const data = (
      publish ? publishFormDraftSchema : saveFormDraftSchema
    ).safeParse(input);
    if (!data.success)
      throw new ApplicationError(
        'INVALID_FORM',
        400,
        'Revise campos, opções e condições. Referências devem apontar para campos anteriores.',
      );
    try {
      return await this.repo.write(
        identity,
        this.id(id),
        data.data.expectedRevision,
        publish ? undefined : saveFormDraftSchema.parse(input).definition,
        publish,
      );
    } catch (e) {
      if (
        (e as { code?: string }).code === 'P2034' ||
        ['40001', '40P01', '23505'].includes(databaseErrorCode(e) ?? '')
      )
        throw new ApplicationError(
          'FORM_CONFLICT',
          409,
          'O formulário foi alterado por outra operação. Atualize antes de tentar novamente.',
        );
      throw e;
    }
  }
}
