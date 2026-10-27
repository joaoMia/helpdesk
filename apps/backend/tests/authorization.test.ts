import { describe, expect, it } from '@jest/globals';
import type { UserRole } from '@helpdesk/contracts';
import type { Identity } from '../src/modules/auth/auth.service.js';
import {
  hasPermission,
  requirePermission,
} from '../src/modules/authorization/permissions.js';
import type { Permission } from '../src/modules/authorization/permissions.js';
import {
  ticketScope,
  triageSelect,
} from '../src/modules/authorization/ticket-scope.js';
import type { TicketOperation } from '../src/modules/authorization/ticket-scope.js';
import { userScope } from '../src/modules/authorization/user-scope.js';
import type { UserOperation } from '../src/modules/authorization/user-scope.js';

function actor(role: UserRole, mustChangePassword = false): Identity {
  return {
    sessionId: 'd8a20cae-7ef1-4f71-a2b3-e2c335879e11',
    user: {
      id: '4a302fa4-b739-4e6d-b962-88f44d570ceb',
      name: 'Pessoa fictícia',
      email: 'teste@example.invalid',
      role,
      mustChangePassword,
    },
  };
}
describe('HD-018 políticas com negação por padrão', () => {
  it('não tem wildcard de administrador nem operações pendentes implicitamente liberadas', () => {
    for (const role of ['REQUESTER', 'TECHNICIAN', 'ADMIN'] as const)
      for (const unknown of [
        'tickets.close',
        'tickets.transfer',
        'tickets.reopen',
        'tickets.pending',
        'technicians.delete',
        'services.delete',
        'users.change-role',
        '__proto__',
        'constructor',
        'toString',
        '*',
      ])
        expect(hasPermission(role, unknown as Permission)).toBe(false);
    for (const operation of [
      'tickets.classify',
      'tickets.start',
      'tickets.update-assigned',
    ] as const) {
      expect(hasPermission('ADMIN', operation)).toBe(false);
      expect(hasPermission('REQUESTER', operation)).toBe(false);
      expect(hasPermission('TECHNICIAN', operation)).toBe(true);
    }
  });
  it('exige identidade e troca de senha também nas políticas de serviço/repositório', () => {
    expect(() => requirePermission(undefined, 'tickets.read')).toThrow(
      expect.objectContaining({ status: 401 }),
    );
    expect(() =>
      ticketScope(actor('TECHNICIAN', true), 'tickets.read'),
    ).toThrow(expect.objectContaining({ code: 'PASSWORD_CHANGE_REQUIRED' }));
  });
  it('triagem seleciona apenas metadados conservadores', () => {
    expect(Object.keys(triageSelect).sort()).toEqual([
      'code',
      'createdAt',
      'id',
      'priority',
      'status',
    ]);
    expect(ticketScope(actor('TECHNICIAN'), 'tickets.triage')).toEqual({
      status: 'OPEN',
      assignedTechnicianId: null,
    });
  });
  it('início exige classificação sem confundir com autorização ou atribuir chamado', () => {
    expect(ticketScope(actor('TECHNICIAN'), 'tickets.start')).toMatchObject({
      status: 'OPEN',
      assignedTechnicianId: null,
      priority: { not: null },
    });
    expect(
      ticketScope(actor('TECHNICIAN'), 'tickets.classify'),
    ).not.toHaveProperty('priority');
  });
  it('não aceita uma operação de outro tipo de recurso em runtime', () => {
    expect(() =>
      ticketScope(actor('ADMIN'), 'users.read' as TicketOperation),
    ).toThrow(expect.objectContaining({ status: 403 }));
    expect(() =>
      userScope(actor('ADMIN'), 'tickets.read' as UserOperation),
    ).toThrow(expect.objectContaining({ status: 403 }));
  });
  it('escopos globais, próprios e de atualização não são intercambiáveis', () => {
    const tech = actor('TECHNICIAN'),
      requester = actor('REQUESTER');
    expect(ticketScope(requester, 'tickets.read')).toEqual({
      requesterId: requester.user.id,
    });
    expect(ticketScope(tech, 'tickets.aggregate')).toEqual({
      assignedTechnicianId: tech.user.id,
    });
    expect(ticketScope(actor('ADMIN'), 'tickets.read')).toEqual({});
    expect(ticketScope(tech, 'tickets.update-assigned')).toEqual({
      AND: [
        { assignedTechnicianId: tech.user.id },
        { status: { not: 'CLOSED' } },
      ],
    });
  });
});
