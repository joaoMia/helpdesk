import type { PublicUser } from '@helpdesk/contracts';
export const projectLabels: Record<string, string> = {
  REQUESTED: 'Solicitado',
  PLANNING: 'Em planejamento',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  CANCELED: 'Cancelado',
};
export const projectArea = (u: PublicUser) =>
  u.role === 'ADMIN'
    ? 'admin'
    : u.role === 'TECHNICIAN'
      ? 'technician'
      : 'requester';
