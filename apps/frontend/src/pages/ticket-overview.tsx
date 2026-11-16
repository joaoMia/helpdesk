import { RemoveRecordButton } from '../components/remove-record-button';
import { TicketPriorityEditor } from '../components/ticket-priority-editor';
import { useEffect, useState } from 'react';
import type { PublicUser } from '@helpdesk/contracts';
import type { OperationalTicket, OverviewQuery } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import {
  PageHeading,
  Icon,
  EmptyState,
  PriorityBadge,
  StatusBadge,
} from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { TicketPagination } from '../components/ticket-pagination';
import { AssignmentPreviewDialog } from '../components/assignment-preview-dialog';
import { date, statusLabels, priorityLabels } from '../lib/presentation';

export function TicketOverview({
  admin = false,
  user,
  onExpired,
}: {
  admin?: boolean;
  user?: PublicUser;
  onExpired: () => void;
}) {
  const [items, setItems] = useState<OperationalTicket[]>([]),
    [text, setText] = useState(''),
    [status, setStatus] = useState<OverviewQuery['status']>(),
    [priority, setPriority] = useState<OverviewQuery['priority']>(),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(''),
    [revision, setRevision] = useState(0),
    [assigning, setAssigning] = useState<{
      id: string;
      code: number;
      priority: 'LOW' | 'MEDIUM' | 'HIGH';
    } | null>(null);
  const [notice, setNotice] = useState('');
  const search = useDebouncedValue(text.trim()),
    key = JSON.stringify([page, search, status, priority, revision]),
    loading = loaded !== key || text.trim() !== search;
  useEffect(() => {
    let active = true;
    authClient
      .overview({
        page,
        pageSize: 10,
        search,
        status,
        priority,
      })
      .then((result) => {
        if (active) {
          setItems(result.items);
          setTotal(result.total);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          setItems([]);
          setTotal(0);
          if (e instanceof AuthError && e.status === 401) onExpired();
          else
            setError('Não foi possível carregar os chamados. Tente novamente.');
        }
      })
      .finally(() => {
        if (active) setLoaded(key);
      });
    return () => {
      active = false;
    };
  }, [page, search, status, priority, revision, key, onExpired, user]);
  return (
    <>
      <PageHeading
        eyebrow="ACOMPANHAMENTO"
        title="Chamados"
        description="Visão operacional global com consulta integral autorizada aos Chamados. As ações de alteração seguem permissões próprias."
      />
      {notice && (
        <p role="status" className="info-note">
          {notice}
        </p>
      )}
      {!admin && (
        <nav className="tab-bar" aria-label="Filas de chamados">
          <a href="#/technician/chamados/nao-classificados">
            Não classificados
          </a>
          <a href="#/technician/chamados/classificados">Classificados</a>
          <a
            className="tab-active"
            aria-current="page"
            href="#/technician/chamados/todos"
          >
            Todos
          </a>
        </nav>
      )}
      <MotionRegion motionKey="real-ticket-overview">
        <section className="panel">
          <form
            className="filter-bar"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setRevision((n) => n + 1);
            }}
          >
            <label className="search-field">
              <Icon name="search" />
              <span className="sr-only">Buscar número ou responsável</span>
              <input
                maxLength={120}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar número ou responsável"
              />
            </label>
            <label>
              <span className="sr-only">Filtrar por status</span>
              <select
                className="field"
                value={status ?? ''}
                onChange={(e) => {
                  setStatus(
                    (e.target.value as OverviewQuery['status']) || undefined,
                  );
                  setPage(1);
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
                    (e.target.value as OverviewQuery['priority']) || undefined,
                  );
                  setPage(1);
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
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setText('');
                setStatus(undefined);
                setPriority(undefined);
                setPage(1);
              }}
            >
              Limpar filtros
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setRevision((n) => n + 1)}
            >
              Atualizar
            </button>
          </form>
          {error && (
            <p role="alert" className="form-error p-5">
              {error}
            </p>
          )}
          {loading && items.length > 0 && (
            <p role="status" className="px-6 py-2 text-xs text-slate-500">
              Atualizando chamados…
            </p>
          )}
          {loading && !items.length ? (
            <p role="status" className="p-6">
              Carregando chamados…
            </p>
          ) : (
            !error &&
            (!items.length ? (
              <EmptyState title="Nenhum chamado encontrado">
                Experimente outros filtros.
              </EmptyState>
            ) : (
              <div className="table-scroll">
                <div
                  className="mobile-record-list"
                  aria-label="Lista de chamados"
                >
                  {items.map((t) => (
                    <article className="mobile-record-card" key={t.id}>
                      <a
                        className="mobile-record-title"
                        href={
                          admin
                            ? '#/admin/chamado/' + t.id
                            : '#/technician/chamado/' + t.id
                        }
                      >
                        HD-{t.code} ·{' '}
                        {[t.categoryName, t.serviceName]
                          .filter(Boolean)
                          .join(' > ') || 'Serviço não informado'}
                      </a>
                      <p className="mt-1 text-xs text-slate-500">
                        {t.requesterName ?? 'Solicitante não informado'} ·{' '}
                        {t.departmentName ?? 'Setor não informado'} ·{' '}
                        {t.companyName ?? 'Empresa não informada'}
                      </p>
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
                          <small>Responsável</small>
                          {t.responsibleName ?? 'Não atribuído'}
                        </span>
                        <span>
                          <small>Abertura</small>
                          {date(t.createdAt)}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(admin || t.canRetire) && (
                          <RemoveRecordButton
                            kind="ticket"
                            id={t.id}
                            label="Excluir"
                            code={t.code}
                            onExpired={onExpired}
                            onRemoved={() => {
                              setNotice(
                                'Chamado excluído das visualizações operacionais. Histórico preservado.',
                              );
                              setRevision((n) => n + 1);
                            }}
                          />
                        )}
                        {!admin &&
                          t.status === 'OPEN' &&
                          !t.responsibleName && (
                            <TicketPriorityEditor
                              id={t.id}
                              priority={t.priority}
                              onExpired={onExpired}
                              disabled={loading}
                              onSaved={() => setRevision((n) => n + 1)}
                            />
                          )}
                        {t.status === 'OPEN' &&
                          t.priority &&
                          !t.responsibleName && (
                            <button
                              className="button-secondary"
                              onClick={() =>
                                setAssigning({
                                  id: t.id,
                                  code: t.code,
                                  priority: t.priority!,
                                })
                              }
                            >
                              Atribuir chamado
                            </button>
                          )}
                      </div>
                    </article>
                  ))}
                </div>
                <table className="ticket-table desktop-record-table">
                  <caption className="sr-only">
                    Visão operacional global sem informações privadas
                  </caption>
                  <thead>
                    <tr>
                      <th>Chamado</th>
                      <th>Contexto</th>
                      <th>Status</th>
                      <th>Prioridade</th>
                      <th>Responsável</th>
                      <th>Abertura</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((t) => (
                      <tr key={t.id}>
                        <td>
                          {admin ? (
                            <a
                              className="ticket-number"
                              href={'#/admin/chamado/' + t.id}
                            >
                              HD-{t.code}
                            </a>
                          ) : (
                            <a
                              className="ticket-number"
                              href={'#/technician/chamado/' + t.id}
                            >
                              HD-{t.code}
                            </a>
                          )}
                        </td>
                        <td>
                          <p className="text-sm font-medium">
                            {[t.categoryName, t.serviceName]
                              .filter(Boolean)
                              .join(' > ') || 'Serviço não informado'}
                          </p>
                          <p className="text-xs text-slate-500">
                            {t.requesterName ?? 'Solicitante não informado'} ·{' '}
                            {t.departmentName ?? 'Setor não informado'} ·{' '}
                            {t.companyName ?? 'Empresa não informada'}
                          </p>
                        </td>
                        <td>
                          <StatusBadge status={t.status} />
                        </td>
                        <td>
                          <PriorityBadge priority={t.priority} />
                        </td>
                        <td>{t.responsibleName ?? 'Não atribuído'}</td>
                        <td className="whitespace-nowrap text-xs text-slate-500">
                          {date(t.createdAt)}
                        </td>
                        <td>
                          {(admin || t.canRetire) && (
                            <RemoveRecordButton
                              kind="ticket"
                              id={t.id}
                              label="Excluir"
                              code={t.code}
                              onExpired={onExpired}
                              onRemoved={() => {
                                setNotice(
                                  'Chamado excluído das visualizações operacionais. Histórico preservado.',
                                );
                                setRevision((n) => n + 1);
                              }}
                            />
                          )}
                          {!admin &&
                            t.status === 'OPEN' &&
                            !t.responsibleName && (
                              <TicketPriorityEditor
                                id={t.id}
                                priority={t.priority}
                                onExpired={onExpired}
                                disabled={loading}
                                onSaved={() => setRevision((n) => n + 1)}
                              />
                            )}
                          {t.status === 'OPEN' &&
                          t.priority &&
                          !t.responsibleName ? (
                            <button
                              className="button-secondary"
                              onClick={() =>
                                setAssigning({
                                  id: t.id,
                                  code: t.code,
                                  priority: t.priority!,
                                })
                              }
                            >
                              Atribuir chamado
                              <span className="sr-only"> HD-{t.code}</span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">{''}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
          <TicketPagination
            page={page}
            total={total}
            busy={loading}
            onPage={setPage}
          />
        </section>
      </MotionRegion>
      {assigning !== null && (
        <AssignmentPreviewDialog
          id={assigning.id}
          code={assigning.code}
          priority={assigning.priority}
          onAssigned={() => {
            setAssigning(null);
            setRevision((n) => n + 1);
          }}
          onClose={() => setAssigning(null)}
          onExpired={onExpired}
        />
      )}
    </>
  );
}
