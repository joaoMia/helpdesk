import type { TicketSummary, PublicUser } from '@helpdesk/contracts';
import { date } from '../lib/presentation';
import { EmptyState, Icon, PriorityBadge, StatusBadge } from './ui';
export function RealTicketTable({
  tickets,
  technician,
}: {
  tickets: TicketSummary[];
  technician?: PublicUser;
}) {
  const detailBase = technician
    ? '#/technician/chamado/'
    : '#/requester/chamado/';
  if (!tickets.length)
    return (
      <EmptyState title="Nenhum chamado por aqui">
        <p>
          {technician
            ? 'Experimente outros filtros ou consulte a fila de classificados.'
            : 'Experimente outros filtros ou abra sua primeira solicitação.'}
        </p>
      </EmptyState>
    );
  return (
    <div className="table-scroll">
      <div className="mobile-record-list" aria-label="Lista de chamados">
        {tickets.map((t) => (
          <article className="mobile-record-card" key={t.id}>
            <a className="mobile-record-title" href={detailBase + t.id}>
              HD-{t.code} · {t.subject}
            </a>
            <p className="text-xs text-slate-500">{t.serviceName}</p>
            <div className="mobile-record-meta">
              <span>
                <small>Status</small>
                <StatusBadge status={t.status} />
              </span>
              <span>
                <small>Prioridade</small>
                <PriorityBadge priority={t.priority} />
              </span>
              <span>
                <small>Abertura</small>
                {date(t.createdAt)}
              </span>
              <span>
                <small>Responsável</small>
                {t.assignedTechnicianId
                  ? technician?.id === t.assignedTechnicianId
                    ? technician.name
                    : 'Técnico atribuído'
                  : 'Sem responsável'}
              </span>
            </div>
            <a
              className="button-secondary mt-3 w-full justify-center"
              href={detailBase + t.id}
            >
              Abrir chamado <Icon name="chevron" />
            </a>
          </article>
        ))}
      </div>
      <table className="ticket-table desktop-record-table">
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
                <a className="ticket-link" href={detailBase + t.id}>
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
                  {technician && t.assignedTechnicianId === technician.id
                    ? technician.name
                    : t.assignedTechnicianId
                      ? 'Técnico atribuído'
                      : 'Sem responsável'}
                </span>
              </td>
              <td className="whitespace-nowrap text-xs text-slate-500">
                {date(t.createdAt)}
              </td>
              <td>
                <a
                  href={detailBase + t.id}
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
