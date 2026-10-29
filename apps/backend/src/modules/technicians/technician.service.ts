import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  createTechnicianSchema,
  updateTechnicianSchema,
  technicianQuerySchema,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import {
  requirePermission,
  resourceNotFound,
} from '../authorization/permissions.js';
import { hashPassword } from '../auth/password.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import { TechnicianRepository } from './technician.repository.js';
const invalid = () =>
  new ApplicationError(
    'INVALID_INPUT',
    400,
    'Informe nome/e-mail válidos e somente os campos permitidos.',
  );
export class TechnicianService {
  constructor(private repo: TechnicianRepository) {}
  list(identity: Identity, input: unknown) {
    requirePermission(identity, 'technicians.read');
    const result = technicianQuerySchema.safeParse(input);
    if (!result.success) throw invalid();
    return this.repo.list(result.data);
  }
  detail(identity: Identity, id: unknown) {
    requirePermission(identity, 'technicians.read');
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) throw resourceNotFound();
    return this.repo.detail(parsed.data);
  }
  private async write<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      if (
        (error as { code?: string })?.code === 'P2002' ||
        databaseErrorCode(error) === '23505'
      )
        throw new ApplicationError(
          'TECHNICIAN_CONFLICT',
          409,
          'Não foi possível salvar com os dados informados. Revise o e-mail.',
        );
      throw error;
    }
  }
  async create(identity: Identity, input: unknown) {
    requirePermission(identity, 'technicians.create');
    const parsed = createTechnicianSchema.safeParse(input);
    if (!parsed.success) throw invalid();
    const temporaryPassword = randomBytes(24).toString('base64url');
    const hash = await hashPassword(temporaryPassword);
    const technician = await this.write(() =>
      this.repo.create(identity, parsed.data, hash),
    );
    return { technician, temporaryPassword };
  }
  update(identity: Identity, id: unknown, input: unknown) {
    requirePermission(identity, 'technicians.update');
    const target = z.uuid().safeParse(id);
    if (!target.success) throw resourceNotFound();
    const parsed = updateTechnicianSchema.safeParse(input);
    if (!parsed.success) throw invalid();
    return this.write(() =>
      this.repo.update(identity, target.data, parsed.data),
    );
  }
}
