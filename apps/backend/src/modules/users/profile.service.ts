import { updateProfileSchema, publicUserSchema } from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import { Passwords } from '../auth/password.js';
import { requirePermission, forbidden } from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import { ProfileRepository } from './profile.repository.js';
export class ProfileService {
  private passwords = new Passwords();
  constructor(private repo: ProfileRepository) {}
  async update(identity: Identity, payload: unknown) {
    requirePermission(identity, 'users.update-self');
    if (!['REQUESTER', 'TECHNICIAN'].includes(identity.user.role))
      throw forbidden();
    const parsed = updateProfileSchema.safeParse(payload);
    if (!parsed.success)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Informe nome válido e/ou e-mail válido; campos adicionais não são permitidos.',
      );
    const user = await this.repo.find(identity.user.id);
    if (!user) throw invalidSession();
    if (parsed.data.email !== undefined && parsed.data.email !== user.email) {
      if (
        !parsed.data.currentPassword ||
        !(await this.passwords.verify(
          user.passwordHash,
          parsed.data.currentPassword,
        ))
      )
        throw new ApplicationError(
          'CURRENT_PASSWORD_INVALID',
          403,
          'Confirme a senha atual para alterar o e-mail.',
        );
    }
    try {
      const result = await this.repo.update(identity, parsed.data, user);
      const { id, name, email, role, mustChangePassword } = result.user;
      return {
        user: publicUserSchema.parse({
          id,
          name,
          email,
          role,
          mustChangePassword,
        }),
        reauthenticate: result.reauthenticate,
      };
    } catch (error) {
      if (
        (error as { code?: string })?.code === 'P2002' ||
        databaseErrorCode(error) === '23505'
      )
        throw new ApplicationError(
          'PROFILE_UNAVAILABLE',
          409,
          'Não foi possível atualizar o perfil com os dados informados. Revise os dados ou contate o suporte.',
        );
      throw error;
    }
  }
}
