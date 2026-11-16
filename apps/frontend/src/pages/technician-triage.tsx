import { TicketPriorityEditor } from '../components/ticket-priority-editor';
import { useEffect, useRef, useState } from 'react';
import type {
  TriageQuery,
  TriageTicket,
  StartedTicket,
} from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import {
  PageHeading,
  Icon,
  EmptyState,
  PriorityBadge,
  StatusBadge,
} from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { DemoDialog } from '../components/demo-dialog';
import { AssignmentPreviewDialog } from '../components/assignment-preview-dialog';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { TicketPagination } from '../components/ticket-pagination';
import { date, priorityLabels } from '../lib/presentation';

const tabs = [
  ['UNCLASSIFIED', 'nao-classificados', 'Não classificados'],
  ['CLASSIFIED', 'classificados', 'Classificados'],
  ['ALL', 'todos', 'Todos'],
] as const;

export function TechnicianTriage({
  queue,
  onExpired,
}: {
  queue: TriageQuery['queue'];
  onExpired: () => void;
}) {
  const [items, setItems] = useState<TriageTicket[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [text, setText] = useState(''),
    [priority, setPriority] = useState<TriageQuery['priority']>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [actionError, setActionError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [starting, setStarting] = useState<TriageTicket | null>(null),
    [started, setStarted] = useState<StartedTicket | null>(null),
    [saving, setSaving] = useState(false);
  const search = useDebouncedValue(text.trim());
  const [assigning, setAssigning] = useState<{
    id: string;
    code: number;
    priority: 'LOW' | 'MEDIUM' | 'HIGH';
  } | null>(null);
  const [loadedQuery, setLoadedQuery] = useState('');
  const queryKey = JSON.stringify([queue, page, search, priority]);
  const refreshing =
    loading || loadedQuery !== queryKey || text.trim() !== search;
  const sending = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    authClient
      .triage({ queue, page, pageSize: 10, search, priority })
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
            setError(
              e instanceof AuthError
                ? e.message
                : 'Não foi possível carregar a fila. Tente novamente.',
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
  }, [queue, page, search, priority, queryKey, revision, onExpired]);
  function reload() {
    setLoading(true);
    setRevision((n) => n + 1);
  }
  async function start() {
    if (sending.current || !starting) return;
    sending.current = true;
    setSaving(true);
    setActionError('');
    setNotice('');
    setStarted(null);
    try {
      const ticket = await authClient.startTicket(starting.id);
      if (!alive.current) return;
      setStarted(ticket);
      setStarting(null);
      setNotice(
        `Atendimento de HD-${ticket.code} iniciado e atribuído à sua conta.`,
      );
      reload();
    } catch (e) {
      if (!alive.current) return;
      setStarting(null);
      if (e instanceof AuthError && e.status === 401) onExpired();
      else {
        setActionError(
          e instanceof AuthError && e.status !== 0 && e.status < 500
            ? e.message
            : 'Não foi possível confirmar a assunção. Consulte Meus atendimentos antes de tentar novamente.',
        );
        reload();
      }
    } finally {
      sending.current = false;
      if (alive.current) setSaving(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ACOMPANHAMENTO"
        title="Chamados"
        description="Triagem operacional de chamados abertos e sem responsável. Classificar não significa assumir."
      />
      <nav className="tab-bar" aria-label="Filas de chamados">
        {tabs.map(([key, path, label]) => (
          <a
            key={key}
            className={queue === key ? 'tab-active' : ''}
            aria-current={queue === key ? 'page' : undefined}
            href={'#/technician/chamados/' + path}
            onClick={() => {
              if (key !== queue) {
                setPage(1);
                setLoading(true);
              }
            }}
          >
            {label}
          </a>
        ))}
      </nav>
      {notice && (
        <p role="status" className="info-note">
          {notice}
        </p>
      )}
      {started && (
        <p className="info-note">
          <a
            className="text-button"
            href={'#/technician/chamado/' + started.id}
          >
            Abrir detalhes de HD-{started.code}
          </a>{' '}
          ·{' '}
          <a className="text-button" href="#/technician/atendimentos">
            Ver meus atendimentos
          </a>
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {actionError && (
        <p role="alert" className="form-error">
          {actionError}
        </p>
      )}
      <MotionRegion motionKey="real-technician-triage">
        <section className="panel">
          <p className="info-note m-5 mb-0">
            Categoria, serviço, solicitante, setor e empresa ajudam na triagem.
            Descrição, respostas e anexos continuam restritos ao atendimento
            autorizado. Classificar não atribui nem inicia atendimento.
          </p>
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
              <span className="sr-only">Buscar número do chamado</span>
              <input
                value={text}
                maxLength={30}
                placeholder="Buscar por número: HD-123"
                onChange={(e) => {
                  setText(e.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label>
              <span className="sr-only">Filtrar por prioridade</span>
              <select
                className="field"
                value={priority ?? ''}
                onChange={(e) => {
                  setPriority(
                    (e.target.value as TriageQuery['priority']) || undefined,
                  );
                  setPage(1);
                  reload();
                }}
              >
                <option value="">Todas as prioridades</option>
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
              disabled={refreshing || saving}
              onClick={reload}
            >
              Atualizar
            </button>
          </form>
          {refreshing && items.length > 0 && (
            <p role="status" className="px-6 py-2 text-xs text-slate-500">
              Atualizando fila…
            </p>
          )}
          {refreshing && !items.length ? (
            <p role="status" className="p-6">
              Carregando fila…
            </p>
          ) : !items.length ? (
            <EmptyState title="Nenhum chamado nesta fila">
              Experimente outros filtros ou atualize para consultar novas
              solicitações.
            </EmptyState>
          ) : (
            <div className="table-scroll">
              <p className="px-6 py-3 text-xs text-slate-500 sm:hidden">
                Deslize a tabela para ver todas as colunas →
              </p>
              <table className="ticket-table">
                <caption className="sr-only">
                  Fila real de triagem, sem dados privados
                </caption>
                <thead>
                  <tr>
                    <th>Chamado</th>
                    <th>Contexto</th>
                    <th>Status</th>
                    <th>Prioridade</th>
                    <th>Abertura</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <a
                          className="ticket-link"
                          href={'#/technician/triagem/' + t.id}
                        >
                          <span className="ticket-number">HD-{t.code}</span>
                        </a>
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
                      <td className="whitespace-nowrap text-xs text-slate-500">
                        {date(t.createdAt)}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <TicketPriorityEditor
                            id={t.id}
                            priority={t.priority}
                            onExpired={onExpired}
                            disabled={refreshing}
                            onSaved={() => {
                              setNotice(
                                `Prioridade de HD-${t.code} atualizada.`,
                              );
                              reload();
                            }}
                          />
                          {queue === 'CLASSIFIED' && t.priority && (
                            <>
                              <button
                                className="button-secondary"
                                disabled={saving}
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
                              <button
                                className="button-primary"
                                disabled={saving}
                                onClick={() => {
                                  setStarted(null);
                                  setStarting(t);
                                }}
                              >
                                Iniciar meu atendimento
                                <span className="sr-only"> HD-{t.code}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <TicketPagination
            page={page}
            total={total}
            busy={refreshing || saving}
            onPage={(p) => {
              setPage(p);
              setLoading(true);
            }}
          />
        </section>
      </MotionRegion>
      {starting && (
        <DemoDialog
          eyebrow="ASSUNÇÃO REAL"
          title={`Iniciar meu atendimento em HD-${starting.code}?`}
          description="O atendimento será iniciado e atribuído à sua conta. Serviço, prioridade e informações históricas serão preservados."
          pending={saving}
          confirmLabel={saving ? 'Iniciando…' : 'Confirmar assunção'}
          onCancel={() => {
            if (!sending.current) setStarting(null);
          }}
          onConfirm={() => {
            void start();
            return false;
          }}
        >
          <p className="info-note">
            Esta ação muda OPEN para IN_PROGRESS. Pendência e encerramento ainda
            não estão disponíveis.
          </p>
        </DemoDialog>
      )}
      {assigning !== null && (
        <AssignmentPreviewDialog
          id={assigning.id}
          code={assigning.code}
          priority={assigning.priority}
          onAssigned={() => {
            setAssigning(null);
            setNotice(
              'Chamado atribuído. O atendimento ainda não foi iniciado.',
            );
            reload();
          }}
          onClose={() => setAssigning(null)}
          onExpired={onExpired}
        />
      )}
    </>
  );
}
