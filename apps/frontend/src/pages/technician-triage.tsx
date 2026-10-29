import { useEffect, useRef, useState } from 'react';
import type {
  TriageQuery,
  TriageTicket,
  ClassifyPriority,
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
    [search, setSearch] = useState(''),
    [priority, setPriority] = useState<TriageQuery['priority']>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [actionError, setActionError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<TriageTicket | null>(null),
    [choice, setChoice] = useState<ClassifyPriority['priority']>('MEDIUM'),
    [saving, setSaving] = useState(false);
  const [loadedQuery, setLoadedQuery] = useState('');
  const queryKey = JSON.stringify([queue, page, search, priority]);
  const refreshing = loading || loadedQuery !== queryKey;
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
  async function classify() {
    if (sending.current || !selected) return;
    sending.current = true;
    setSaving(true);
    setActionError('');
    setNotice('');
    try {
      const ticket = await authClient.classifyPriority(selected.id, {
        priority: choice,
        expectedPriority: selected.priority,
      });
      if (!alive.current) return;
      setNotice(
        `Prioridade de HD-${ticket.code} confirmada: ${priorityLabels[ticket.priority!]}. O chamado permanece aberto e sem responsável.`,
      );
      setSelected(null);
      reload();
    } catch (e) {
      if (!alive.current) return;
      setSelected(null);
      if (e instanceof AuthError && e.status === 401) onExpired();
      else {
        setActionError(
          e instanceof AuthError && e.status !== 0 && e.status < 500
            ? e.message
            : 'Não foi possível confirmar o resultado. Atualize a fila antes de tentar novamente.',
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
                setSelected(null);
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
            Somente número, status, prioridade e abertura ficam disponíveis na
            triagem. Assunto, solicitante e detalhes permanecem privados até a
            atribuição. Todos reúne apenas as duas filas operacionais.
          </p>
          <form
            className="filter-bar"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(text.trim());
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
                onChange={(e) => setText(e.target.value)}
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
                setSearch('');
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
          {refreshing ? (
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
                        <span className="ticket-number">HD-{t.code}</span>
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
                        <button
                          className="button-secondary"
                          disabled={saving}
                          onClick={() => {
                            setChoice(t.priority ?? 'MEDIUM');
                            setSelected(t);
                          }}
                        >
                          Classificar
                          <span className="sr-only"> HD-{t.code}</span>
                        </button>
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
      {selected && (
        <DemoDialog
          eyebrow="CLASSIFICAÇÃO REAL"
          title={`Classificar HD-${selected.code}`}
          description="Defina a prioridade. O chamado continuará OPEN, sem técnico e sem início de atendimento."
          confirmLabel={saving ? 'Salvando…' : 'Confirmar prioridade'}
          pending={saving}
          onCancel={() => {
            if (!sending.current) setSelected(null);
          }}
          onConfirm={() => {
            void classify();
            return false;
          }}
        >
          <label className="form-label">
            Prioridade
            <select
              className="field"
              value={choice}
              disabled={saving}
              onChange={(e) =>
                setChoice(e.target.value as ClassifyPriority['priority'])
              }
            >
              {Object.entries(priorityLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <p className="info-note mt-4">
            A alteração será registrada no histórico. Nenhum atendimento será
            assumido.
          </p>
        </DemoDialog>
      )}
    </>
  );
}
