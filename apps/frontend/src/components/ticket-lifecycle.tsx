import { useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  SolutionDeadlineReason,
  TicketMetrics,
} from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { Panel } from './ui';
import { DemoDialog } from './demo-dialog';
import { TicketPagination } from './ticket-pagination';
import { useDebouncedValue } from '../hooks/use-debounced-value';
const duration = (seconds: number) =>
  `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min úteis`;
const deadlineReasons: Record<SolutionDeadlineReason, string> = {
  POLICY_MISSING: 'Nenhuma política de SLA está vinculada ao chamado.',
  NOT_STARTED: 'O prazo será calculado após o início do atendimento.',
  SLA_ENDED: 'A contagem do SLA já terminou.',
  SLA_SUSPENDED: 'Contagem suspensa até a retomada do atendimento.',
  CALENDAR_MISSING: 'Nenhuma jornada aplicável está configurada.',
  CALENDAR_GAP: 'Falta cobertura de calendário em parte do período do SLA.',
  INVALID_CALENDAR: 'A configuração da jornada está incompleta.',
  INVALID_PENDING: 'Há uma pendência sem regra de contagem válida.',
  UNKNOWN_CONSUMPTION: 'O consumo anterior da revisão do SLA é desconhecido.',
  NO_WORKING_TIME:
    'A jornada não oferece horas úteis suficientes para projetar o prazo.',
};
type Reason = { id: string; name: string };
export function TicketAttendanceDates({
  data,
  createdAt,
  resolvedAt,
}: {
  data: TicketMetrics;
  createdAt?: string;
  resolvedAt?: string | null;
}) {
  const target = data.sla.at(-1)?.targetMinutes;
  const display = (stamp: string) => (
    <time dateTime={stamp}>{new Date(stamp).toLocaleString('pt-BR')}</time>
  );
  return (
    <dl className="ticket-date-summary">
      <div>
        <dt>Data e hora da abertura</dt>
        <dd>{createdAt ? display(createdAt) : 'Não informado'}</dd>
      </div>
      <div>
        <dt>Tempo para solução</dt>
        <dd>
          {data.solutionDeadlineAt
            ? display(data.solutionDeadlineAt)
            : data.solutionDeadlineReason
              ? deadlineReasons[data.solutionDeadlineReason]
              : 'Prazo indisponível.'}
          {target != null && (
            <small className="mt-1 block font-normal text-slate-500">
              Meta configurada: {duration(target * 60)}
            </small>
          )}
        </dd>
      </div>
      <div>
        <dt>Data da solução</dt>
        <dd>{resolvedAt ? display(resolvedAt) : 'Ainda não solucionado'}</dd>
      </div>
    </dl>
  );
}

export function TicketLifecycle({
  id,
  status,
  createdAt,
  resolvedAt,
  canOperate = false,
  canClose = false,
  additionalActions,
  onSolve,
  refreshKey = 0,
  onExpired,
  onChanged,
}: {
  id: string;
  status: string;
  createdAt?: string;
  resolvedAt?: string | null;
  canOperate?: boolean;
  canClose?: boolean;
  additionalActions?: ReactNode;
  onSolve?: () => void;
  refreshKey?: number;
  onExpired: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<TicketMetrics | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [dialog, setDialog] = useState<'pending' | 'resume' | 'close' | null>(null),
    [busy, setBusy] = useState(false),
    [reasons, setReasons] = useState<Reason[]>([]),
    [reasonId, setReasonId] = useState(''),
    [justification, setJustification] = useState(''),
    [text, setText] = useState(''),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0);
  const sending = useRef(false),
    search = useDebouncedValue(text.trim()),
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
      .ticketMetrics(id)
      .then((r) => {
        if (active) {
          setData(r);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else setError('Não foi possível consultar as métricas.');
        }
      });
    return () => {
      active = false;
    };
  }, [id, status, refreshKey, onExpired]);
  useEffect(() => {
    if (dialog !== 'pending') return;
    let active = true;
    authClient
      .pendingReasons({ page, pageSize: 10, status: 'active', search })
      .then((r) => {
        if (active) {
          setReasons(r.items);
          setTotal(r.total);
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else setError('Não foi possível consultar os motivos.');
        }
      });
    return () => {
      active = false;
    };
  }, [dialog, page, search, onExpired]);
  async function confirm() {
    if (!dialog || sending.current) return;
    if (dialog === 'pending' && (!reasonId || !justification.trim())) {
      setError('Selecione o motivo e informe a justificativa.');
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await authClient.ticketTransition(
        id,
        dialog,
        dialog === 'pending' ? { reasonId, justification } : {},
      );
      if (alive.current) {
        setDialog(null);
        setJustification('');
        setReasonId('');
        setNotice('Operação registrada no HelpDesk.');
        onChanged();
      }
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else
          setError(
            e instanceof AuthError
              ? e.message
              : 'Não foi possível confirmar a operação.',
          );
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const canPause = canOperate && status === 'IN_PROGRESS';
  const canResume = canOperate && status === 'PENDING';
  const showClose = canClose && status === 'RESOLVED';
  const closeBlock = !data
    ? 'Aguarde a consulta das métricas para encerrar.'
    : !resolvedAt
      ? 'Registre uma solução antes de encerrar.'
      : data.activePending
        ? 'O encerramento exige que a pendência esteja concluída.'
        : !data.metrics.complete ||
            data.metrics.aSeconds === null ||
            data.metrics.bSeconds === null
          ? 'O encerramento exige cobertura histórica completa do calendário.'
          : null;
  const dialogTitle = {
    pending: 'Colocar em pendência',
    resume: 'Retomar atendimento',
    close: 'Encerrar chamado',
  };
  function openDialog(operation: 'pending' | 'resume' | 'close') {
    setError('');
    setDialog(operation);
  }
  return (
    <Panel
      title="Atendimento"
      subtitle="Datas registradas e limite de solução configurado"
    >
      <div className="form-body space-y-4">
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
        {(additionalActions || canPause || canResume || showClose) && (
          <div
            role="group"
            aria-label="Ações do atendimento"
            className="flex flex-wrap items-center gap-3"
          >
            {canPause && onSolve && (
              <button className="button-primary" onClick={onSolve}>
                Adicionar solução
              </button>
            )}
            {canPause && (
              <button
                className="button-secondary"
                onClick={() => openDialog('pending')}
              >
                Colocar em pendência
              </button>
            )}
            {canResume && (
              <button
                className="button-primary"
                onClick={() => openDialog('resume')}
              >
                Retomar atendimento
              </button>
            )}
            {showClose && (
              <>
                <button
                  className="button-primary"
                  disabled={!!closeBlock}
                  onClick={() => openDialog('close')}
                >
                  Encerrar chamado
                </button>
                {closeBlock && (
                  <p className="basis-full text-sm text-slate-500">
                    {closeBlock}
                  </p>
                )}
              </>
            )}
            {additionalActions}
          </div>
        )}
        {!data ? (
          <p role="status">Consultando métricas…</p>
        ) : (
          <>
            <TicketAttendanceDates
              data={data}
              createdAt={createdAt}
              resolvedAt={resolvedAt}
            />
            {data.activePending && (
              <section className="info-note">
                <h3 className="font-semibold">
                  Pendência: {data.activePending.snapshot.name}
                </h3>
                <p className="whitespace-pre-wrap">
                  {data.activePending.justification}
                </p>
                <p className="text-xs">
                  {data.activePending.snapshot.countsTowardSolution
                    ? 'Conta tempo útil'
                    : 'Não conta tempo útil'}{' '}
                  ·{' '}
                  {data.activePending.snapshot.autoResumeOnRequesterActivity
                    ? 'Resposta ou anexo confirmado do solicitante retoma o atendimento'
                    : 'Retomada manual pelo técnico'}
                </p>
              </section>
            )}
          </>
        )}
        {dialog && (
          <DemoDialog
            title={dialogTitle[dialog]}
            eyebrow="OPERAÇÃO REAL"
            description="A ação e seu responsável serão registrados no histórico."
            pending={busy}
            onCancel={() => {
              if (!busy) setDialog(null);
            }}
            confirmLabel={busy ? 'Gravando…' : 'Confirmar'}
            onConfirm={() => {
              void confirm();
              return false;
            }}
          >
            {dialog === 'pending' && (
              <div className="space-y-4">
                <label className="form-label">
                  Pesquisar motivo
                  <input
                    className="field w-full"
                    type="search"
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <label className="form-label">
                  Motivo obrigatório
                  <select
                    className="field w-full"
                    value={reasonId}
                    onChange={(e) => setReasonId(e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {reasons.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <TicketPagination
                  page={page}
                  total={total}
                  busy={busy}
                  onPage={setPage}
                />
                <label className="form-label">
                  Justificativa obrigatória
                  <textarea
                    className="field min-h-28 w-full"
                    required
                    maxLength={2000}
                    value={justification}
                    onChange={(e) => setJustification(e.target.value)}
                  />
                </label>
              </div>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </DemoDialog>
        )}
      </div>
    </Panel>
  );
}
