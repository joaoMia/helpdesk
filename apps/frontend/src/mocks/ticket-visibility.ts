import type { DemoTicket, Role } from '../types/demo';
// Escopo visual conservador. A autorização definitiva pertence à API/HD-004.
export function ticketScope(
  tickets: DemoTicket[],
  role: Role,
  page: string,
  tab: string,
) {
  if (role === 'requester')
    return tickets.filter((t) => t.requesterId === 'r1');
  if (role === 'admin') return tickets;
  if (page === 'atendimentos')
    return tickets.filter((t) => t.technicianId === 't1');
  if (tab === 'todos')
    return tickets.filter(
      (t) =>
        t.technicianId === 't1' || (t.status === 'OPEN' && !t.technicianId),
    );
  return tickets.filter(
    (t) =>
      t.status === 'OPEN' &&
      !t.technicianId &&
      (tab === 'classificados' ? !!t.priority : !t.priority),
  );
}
