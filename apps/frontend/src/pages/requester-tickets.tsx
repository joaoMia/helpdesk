import { useDebouncedValue } from '../hooks/use-debounced-value';
import { useEffect, useState } from 'react';
import type {
  TicketSummary,
  TicketQuery,
  PublicUser,
} from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { PageHeading, Icon } from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { RealTicketTable } from '../components/real-ticket-table';
import { TicketPagination } from '../components/ticket-pagination';
import { statusLabels, priorityLabels } from '../lib/presentation';
export function RequesterTickets({
  onExpired,
  technician,
}: {
  onExpired: () => void;
  technician?: PublicUser;
}) {
  const [items, setItems] = useState<TicketSummary[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [text, setText] = useState(''),
    [status, setStatus] = useState<TicketQuery['status']>(),
    [priority, setPriority] = useState<TicketQuery['priority']>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const search = useDebouncedValue(text.trim());
  const [loadedQuery, setLoadedQuery] = useState('');
  const queryKey = JSON.stringify([page, search, status, priority, revision]);
  useEffect(() => {
    let active = true;
    authClient
      .tickets({ page, pageSize: 10, search, status, priority })
      .then((result) => {
        if (active) {
          setItems(result.items);
          setTotal(result.total);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else
            setError(
              'Não foi possível carregar seus chamados. Tente novamente.',
            );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setLoadedQuery(queryKey);
        }
      });
    return () => {
      active = false;
    };
  }, [page, search, status, priority, revision, queryKey, onExpired]);
  function reload() {
    setLoading(true);
    setRevision((n) => n + 1);
  }
  return (
    <>
      <PageHeading
        eyebrow="ACOMPANHAMENTO"
        title={technician ? 'Meus atendimentos' : 'Meus chamados'}
        description={
          technician
            ? 'Chamados atribuídos à sua identidade autenticada. Consulte os detalhes e o histórico real.'
            : 'Encontre solicitações e acompanhe o andamento dos atendimentos.'
        }
      >
        {!technician && (
          <a className="button-primary" href="#/requester/novo">
            <Icon name="plus" />
            Abrir chamado
          </a>
        )}
      </PageHeading>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <MotionRegion motionKey="real-ticket-list">
        <section className="panel">
          <form
            className="filter-bar"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              reload();
            }}
          >
            <label className="search-field">
              <Icon name="search" />
              <span className="sr-only">Buscar chamados</span>
              <input
                value={text}
                maxLength={120}
                onChange={(e) => {
                  setText(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar por número ou assunto"
              />
            </label>
            <label>
              <span className="sr-only">Filtrar por status</span>
              <select
                className="field"
                value={status ?? ''}
                onChange={(e) => {
                  setStatus(
                    (e.target.value as TicketQuery['status']) || undefined,
                  );
                  setPage(1);
                  reload();
                }}
              >
                <option value="">Todos os status</option>
                <option value="RESOLVED">Resolvido</option>
                {Object.entries(statusLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Filtrar por prioridade</span>
              <select
                className="field"
                value={priority ?? ''}
                onChange={(e) => {
                  setPriority(
                    (e.target.value as TicketQuery['priority']) || undefined,
                  );
                  setPage(1);
                  reload();
                }}
              >
                <option value="">Todas as prioridades</option>
                <option value="NONE">Não classificado</option>
                {Object.entries(priorityLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <button className="button-secondary">Buscar</button>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setText('');
                setStatus(undefined);
                setPriority(undefined);
                setPage(1);
                reload();
              }}
            >
              Limpar filtros
            </button>
            <button
              className="text-button"
              type="button"
              disabled={loading}
              onClick={reload}
            >
              Atualizar
            </button>
          </form>
          {items.length > 0 &&
            (loadedQuery !== queryKey || loading || text.trim() !== search) && (
              <p role="status" className="px-5 text-sm text-slate-500">
                Atualizando chamados…
              </p>
            )}
          {(loadedQuery !== queryKey || loading || text.trim() !== search) &&
          !items.length ? (
            <p role="status" className="p-6">
              Carregando chamados…
            </p>
          ) : !error ? (
            <RealTicketTable tickets={items} technician={technician} />
          ) : null}
          <TicketPagination
            page={page}
            total={total}
            busy={loading || loadedQuery !== queryKey || text.trim() !== search}
            onPage={(p) => {
              setPage(p);
              setLoading(true);
            }}
          />
        </section>
      </MotionRegion>
    </>
  );
}
