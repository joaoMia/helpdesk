import type { DemoTicket, Role } from '../types/demo';
import { href } from '../navigation/routes';
import { requesterName, technicianName } from '../mocks/fixtures';
import { date } from '../lib/presentation';
import { EmptyState, Icon, PriorityBadge, StatusBadge } from './ui';

export function TicketTable({
  tickets,
  role,
}: {
  tickets: DemoTicket[];
  role: Role;
}) {
  if (!tickets.length)
    return (
      <EmptyState title="Nenhum chamado por aqui">
        <p>Experimente outros filtros ou aguarde novas solicitações.</p>
      </EmptyState>
    );
  return (
    <div className="table-scroll">
      <p className="px-6 py-3 text-xs text-slate-500 sm:hidden">
        Deslize a tabela para ver todas as colunas →
      </p>
      <table className="ticket-table">
        <caption className="sr-only">
          Chamados fictícios da prévia visual
        </caption>
        <thead>
          <tr>
            <th>Chamado</th>
            <th>Status</th>
            <th>Prioridade</th>
            <th>{role === 'requester' ? 'Responsável' : 'Solicitante'}</th>
            <th>Abertura</th>
            <th>
              <span className="sr-only">Detalhes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id}>
              <td>
                <a
                  className="ticket-link"
                  href={href(role, `chamado/${ticket.id}`)}
                >
                  <span className="ticket-number">HD-{ticket.id}</span>
                  <span className="ticket-subject">{ticket.subject}</span>
                </a>
                <p className="mt-1 text-xs text-slate-500">
                  {ticket.services.map((s) => s.name).join(' · ')}
                </p>
              </td>
              <td>
                <StatusBadge status={ticket.status} />
              </td>
              <td>
                <PriorityBadge priority={ticket.priority} />
              </td>
              <td>
                <span className="text-sm text-slate-600">
                  {role === 'requester'
                    ? technicianName(ticket.technicianId)
                    : requesterName(ticket.requesterId)}
                </span>
              </td>
              <td className="whitespace-nowrap text-xs text-slate-500">
                {date(ticket.createdAt)}
              </td>
              <td>
                <a
                  href={href(role, `chamado/${ticket.id}`)}
                  className="icon-button"
                  aria-label={`Ver chamado HD-${ticket.id}`}
                >
                  <Icon name="chevron" />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
