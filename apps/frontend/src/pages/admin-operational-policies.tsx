import { useEffect, useRef, useState } from 'react';
import {
  pendingReasonInputSchema,
  slaPolicyInputSchema,
  type TicketMetrics,
} from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { PageHeading, Panel, EmptyState } from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { DemoDialog } from '../components/demo-dialog';
import { TicketPagination } from '../components/ticket-pagination';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { date, priorityLabels } from '../lib/presentation';
type Reason = {
  id: string;
  name: string;
  isActive: boolean;
  countsTowardSolution: boolean;
  autoResumeOnRequesterActivity: boolean;
};
type Policy = {
  id: string;
  priority: TicketMetrics['sla'][number]['priority'];
  version: number;
  targetMinutes: number;
  createdAt: string;
};
export function AdminOperationalPolicies({
  onExpired,
}: {
  onExpired: () => void;
}) {
  const [tab, setTab] = useState<'sla' | 'pending'>('sla'),
    [policies, setPolicies] = useState<Policy[]>([]),
    [reasons, setReasons] = useState<Reason[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [text, setText] = useState(''),
    [status, setStatus] = useState('all'),
    [loaded, setLoaded] = useState(''),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [policy, setPolicy] = useState<{
      priority: Policy['priority'];
      hours: string;
    } | null>(null),
    [reason, setReason] = useState<
      (Omit<Reason, 'id'> & { id?: string }) | null
    >(null);
  const search = useDebouncedValue(text.trim()),
    key = JSON.stringify([tab, page, search, status, revision]),
    loading = loaded !== key || search !== text.trim(),
    sending = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const req =
      tab === 'sla'
        ? authClient.slaPolicies(page)
        : authClient.pendingReasons({ page, pageSize: 10, search, status });
    req
      .then((r) => {
        if (active) {
          if (tab === 'sla') setPolicies(r.items as Policy[]);
          else setReasons(r.items as Reason[]);
          setTotal(r.total);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else setError('Não foi possível consultar as políticas.');
        }
      })
      .finally(() => {
        if (active) setLoaded(key);
      });
    return () => {
      active = false;
    };
  }, [tab, page, search, status, revision, key, onExpired]);
  async function save() {
    if (sending.current) return;
    const parsed = policy
      ? slaPolicyInputSchema.safeParse({
          priority: policy.priority,
          targetMinutes: Number(policy.hours) * 60,
        })
      : pendingReasonInputSchema.safeParse(
          reason
            ? {
                name: reason.name,
                isActive: reason.isActive,
                countsTowardSolution: reason.countsTowardSolution,
                autoResumeOnRequesterActivity:
                  reason.autoResumeOnRequesterActivity,
              }
            : {},
        );
    if (!parsed.success) {
      setError(
        'Revise os campos. A meta deve representar minutos inteiros positivos.',
      );
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      if (policy) await authClient.saveSlaPolicy(parsed.data);
      else await authClient.savePendingReason(parsed.data, reason?.id);
      if (alive.current) {
        setReason(null);
        setPolicy(null);
        setNotice(
          'Configuração salva. Versões e snapshots anteriores foram preservados.',
        );
        setRevision((n) => n + 1);
      }
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else
          setError(
            e instanceof AuthError
              ? e.message
              : 'Não foi possível confirmar a alteração.',
          );
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRAÇÃO REAL"
        title="SLA e pendências"
        description="Configurações persistidas. Alterações não reescrevem políticas ou períodos históricos."
      />
      <nav className="tab-bar mb-6" aria-label="Políticas operacionais">
        {(
          [
            ['sla', 'Políticas de SLA'],
            ['pending', 'Motivos de pendência'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            className={tab === k ? 'tab-active' : ''}
            aria-pressed={tab === k}
            onClick={() => {
              setTab(k);
              setPage(1);
              setError('');
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="info-note">
          {notice}
        </p>
      )}
      <MotionRegion motionKey={'operational-policies-' + tab}>
        <Panel
          title={
            tab === 'sla'
              ? 'Histórico de metas de solução'
              : 'Motivos configuráveis'
          }
        >
          <div className="form-body space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              {tab === 'pending' && (
                <>
                  <label className="form-label">
                    Pesquisar motivo
                    <input
                      className="field"
                      type="search"
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        setPage(1);
                      }}
                    />
                  </label>
                  <label className="form-label">
                    Situação
                    <select
                      className="field"
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="all">Todos</option>
                      <option value="active">Ativos</option>
                      <option value="inactive">Inativos</option>
                    </select>
                  </label>
                </>
              )}
              <button
                className="button-primary"
                onClick={() => {
                  setError('');
                  if (tab === 'sla') setPolicy({ priority: 'LOW', hours: '' });
                  else
                    setReason({
                      name: '',
                      isActive: true,
                      countsTowardSolution: false,
                      autoResumeOnRequesterActivity: false,
                    });
                }}
              >
                {tab === 'sla' ? 'Nova versão de meta' : 'Criar motivo'}
              </button>
            </div>
            {loading ? (
              <p role="status">Consultando configurações…</p>
            ) : total === 0 ? (
              <EmptyState title="Nenhuma configuração encontrada">
                Ajuste a busca ou cadastre um motivo.
              </EmptyState>
            ) : (
              <div className="table-scroll">
                <table className="ticket-table">
                  <caption className="sr-only">
                    {tab === 'sla'
                      ? 'Versões das políticas de SLA'
                      : 'Motivos de pendência reais'}
                  </caption>
                  <thead>
                    <tr>
                      {(tab === 'sla'
                        ? ['Prioridade', 'Versão', 'Meta útil', 'Registro']
                        : [
                            'Motivo',
                            'Situação',
                            'Conta tempo',
                            'Retomada por solicitante',
                            'Ação',
                          ]
                      ).map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tab === 'sla'
                      ? policies.map((p) => (
                          <tr key={p.id}>
                            <td>{priorityLabels[p.priority]}</td>
                            <td>v{p.version}</td>
                            <td>{p.targetMinutes / 60} h</td>
                            <td>{date(p.createdAt)}</td>
                          </tr>
                        ))
                      : reasons.map((r) => (
                          <tr key={r.id}>
                            <td>{r.name}</td>
                            <td>{r.isActive ? 'Ativo' : 'Inativo'}</td>
                            <td>{r.countsTowardSolution ? 'Sim' : 'Não'}</td>
                            <td>
                              {r.autoResumeOnRequesterActivity ? 'Sim' : 'Não'}
                            </td>
                            <td>
                              <button
                                className="button-secondary"
                                onClick={() => {
                                  setError('');
                                  setReason({ ...r });
                                }}
                              >
                                Editar
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
              busy={loading}
              onPage={setPage}
            />
          </div>
        </Panel>
      </MotionRegion>
      {(policy || reason) && (
        <DemoDialog
          title={
            policy
              ? 'Configurar nova meta de SLA'
              : 'Configurar motivo de pendência'
          }
          eyebrow="CONFIGURAÇÃO REAL"
          description={
            policy
              ? 'A nova versão será utilizada nas próximas classificações ou revisões de prioridade. Metas já vinculadas permanecem intactas.'
              : 'Alterações valem para novas pendências. Períodos já registrados mantêm seus snapshots.'
          }
          pending={busy}
          onCancel={() => {
            if (!busy) {
              setPolicy(null);
              setReason(null);
            }
          }}
          confirmLabel={busy ? 'Salvando…' : 'Salvar configuração'}
          onConfirm={() => {
            void save();
            return false;
          }}
        >
          {policy ? (
            <div className="space-y-4">
              <label className="form-label">
                Prioridade
                <select
                  className="field w-full"
                  value={policy.priority}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      priority: e.target.value as Policy['priority'],
                    })
                  }
                >
                  {Object.entries(priorityLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Meta em horas úteis
                <input
                  className="field w-full"
                  type="number"
                  min={1 / 60}
                  max={8760}
                  step="any"
                  value={policy.hours}
                  onChange={(e) =>
                    setPolicy({ ...policy, hours: e.target.value })
                  }
                />
              </label>
            </div>
          ) : (
            reason && (
              <div className="space-y-4">
                <label className="form-label">
                  Nome obrigatório
                  <input
                    className="field w-full"
                    value={reason.name}
                    maxLength={160}
                    onChange={(e) =>
                      setReason({ ...reason, name: e.target.value })
                    }
                  />
                </label>
                {(
                  [
                    ['isActive', 'Motivo ativo'],
                    [
                      'countsTowardSolution',
                      'Contabilizar tempo útil durante a pendência',
                    ],
                    [
                      'autoResumeOnRequesterActivity',
                      'Retomar com comentário ou anexo confirmado do solicitante',
                    ],
                  ] as const
                ).map(([k, label]) => (
                  <label key={k} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={reason[k]}
                      onChange={(e) =>
                        setReason({ ...reason, [k]: e.target.checked })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            )
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </DemoDialog>
      )}
    </>
  );
}
