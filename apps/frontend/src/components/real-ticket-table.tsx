import type { TicketSummary } from '@helpdesk/contracts';
import { date } from '../lib/presentation';
import { EmptyState, Icon, PriorityBadge, StatusBadge } from './ui';
export function RealTicketTable({ tickets }: { tickets: TicketSummary[] }) {
  if (!tickets.length)
    return (
      <EmptyState title="Nenhum chamado por aqui">
        <p>Experimente outros filtros ou abra sua primeira solicitação.</p>
      </EmptyState>
    );
  return (
    <div className="table-scroll">
      <p className="px-6 py-3 text-xs text-slate-500 sm:hidden">
        Deslize a tabela para ver todas as colunas →
      </p>
      <table className="ticket-table">
        <caption className="sr-only">
          Seus chamados registrados no HelpDesk
        </caption>
        <thead>
          <tr>
            <th>Chamado</th>
            <th>Status</th>
            <th>Prioridade</th>
            <th>Responsável</th>
            <th>Abertura</th>
            <th>
              <span className="sr-only">Detalhes</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr key={t.id}>
              <td>
                <a className="ticket-link" href={`#/requester/chamado/${t.id}`}>
                  <span className="ticket-number">HD-{t.code}</span>
                  <span className="ticket-subject">{t.subject}</span>
                </a>
                <p className="mt-1 text-xs text-slate-500">{t.serviceName}</p>
              </td>
              <td>
                <StatusBadge status={t.status} />
              </td>
              <td>
                <PriorityBadge priority={t.priority} />
              </td>
              <td>
                <span className="text-sm text-slate-600">
                  {t.assignedTechnicianId
                    ? 'Técnico atribuído'
                    : 'Sem responsável'}
                </span>
              </td>
              <td className="whitespace-nowrap text-xs text-slate-500">
                {date(t.createdAt)}
              </td>
              <td>
                <a
                  href={`#/requester/chamado/${t.id}`}
                  className="icon-button"
                  aria-label={`Ver chamado HD-${t.code}`}
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
