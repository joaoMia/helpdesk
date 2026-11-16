import { useEffect, useState } from 'react';
import type { TicketHistory } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { date, ticketEventLabel } from '../lib/presentation';
import { TicketPagination } from './ticket-pagination';
import { Panel } from './ui';

export function TicketHistoryPanel({
  id,
  revision,
  onExpired,
}: {
  id: string;
  revision: number;
  onExpired: () => void;
}) {
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<TicketHistory | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    authClient
      .ticketHistory(id, page)
      .then((result) => {
        if (active) {
          setHistory(result);
          setError('');
        }
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof AuthError && e.status === 401) onExpired();
        else setError('Não foi possível consultar o histórico.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, page, revision, onExpired]);

  return (
    <Panel title="Histórico do chamado">
      {error && (
        <p className="form-body" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="form-body" role="status">
          Consultando histórico…
        </p>
      )}
      {!!history?.items.length && (
        <ol className="timeline">
          {history.items.map((event) => (
            <li key={event.id}>
              <span className="timeline-dot" />
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-sm font-semibold">
                  {event.actorName ?? 'Sistema'}
                </span>
                <time
                  className="text-xs text-slate-500"
                  dateTime={event.createdAt}
                >
                  {date(event.createdAt)}
                </time>
              </div>
              <p className="text-sm">{ticketEventLabel(event.eventType)}</p>
              {event.responsibleName && (
                <p className="text-sm">Responsável: {event.responsibleName}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      {history && !history.items.length && (
        <p className="form-body">Nenhum evento registrado.</p>
      )}
      {history && (
        <div className="form-body">
          <TicketPagination
            page={page}
            pageSize={history.pageSize}
            total={history.total}
            busy={loading}
            onPage={(p) => {
              setLoading(true);
              setPage(p);
            }}
          />
        </div>
      )}
    </Panel>
  );
}
