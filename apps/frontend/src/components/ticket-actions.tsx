import { useState } from 'react';
import type { DemoAction, DemoTicket, Priority, Role } from '../types/demo';
import { date, priorityLabels } from '../lib/presentation';
import { reasons } from '../mocks/fixtures';
import {
  localDateInput,
  localToInstant,
  validateEffectiveDate,
} from '../mocks/completion';
import { DemoDialog } from './demo-dialog';
import { Panel } from './ui';
type Operation =
  'classify' | 'start' | 'pending' | 'resume' | 'close' | 'correction';
const titles: Record<Operation, string> = {
  classify: 'Classificar prioridade?',
  start: 'Assumir atendimento?',
  pending: 'Registrar pendência?',
  resume: 'Retomar atendimento?',
  close: 'Encerrar atendimento?',
  correction: 'Solicitar correção da data de conclusão',
};
export function TicketActions({
  ticket,
  role,
  onAction,
}: {
  ticket: DemoTicket;
  role: Role;
  onAction: (action: DemoAction) => boolean;
}) {
  const [operation, setOperation] = useState<Operation | null>(null),
    [priority, setPriority] = useState<Priority>('MEDIUM'),
    [reasonId, setReasonId] = useState('p1'),
    [explanation, setExplanation] = useState(''),
    [backdated, setBackdated] = useState(false),
    [effective, setEffective] = useState(''),
    [justification, setJustification] = useState(''),
    [error, setError] = useState('');
  const owns = role === 'technician' && ticket.technicianId === 't1',
    triage =
      role === 'technician' && !ticket.technicianId && ticket.status === 'OPEN';
  const reason = reasons.find((r) => r.id === reasonId)!;
  const recorded = ticket.completionRecordedAt ?? ticket.closedAt,
    actual = ticket.effectiveCompletedAt ?? ticket.closedAt;
  function open(next: Operation) {
    setOperation(next);
    setError('');
    setExplanation('');
    setBackdated(false);
    setJustification('');
    setEffective(
      localDateInput(
        next === 'correction'
          ? (actual ?? new Date().toISOString())
          : new Date().toISOString(),
      ),
    );
  }
  function confirm() {
    if (!operation) return false;
    if (operation === 'pending') {
      if (!explanation.trim()) {
        setError('Informe a justificativa da pendência.');
        return false;
      }
      return onAction({ type: 'pending', id: ticket.id, reason, explanation });
    }
    if (operation === 'close' || operation === 'correction') {
      const instant = localToInstant(effective),
        isCorrection = operation === 'correction';
      if (isCorrection || backdated) {
        const problem = validateEffectiveDate(
          ticket,
          instant,
          justification,
          new Date().toISOString(),
          isCorrection,
        );
        if (problem) {
          setError(problem);
          return false;
        }
      }
      return isCorrection
        ? onAction({
            type: 'request-completion-correction',
            id: ticket.id,
            effectiveAt: instant,
            justification,
          })
        : onAction({
            type: 'close',
            id: ticket.id,
            effectiveAt: backdated ? instant : undefined,
            justification: backdated ? justification : undefined,
          });
    }
    if (operation === 'classify')
      return onAction({ type: 'classify', id: ticket.id, priority });
    return onAction({ type: operation, id: ticket.id });
  }
  return (
    <>
      {(triage || (owns && ticket.status !== 'CLOSED')) && (
        <Panel
          title="Próximo passo"
          subtitle="Confirmações demonstrativas · sem persistência"
        >
          <div className="form-body">
            {triage && !ticket.priority && (
              <>
                <p className="text-sm leading-6 text-slate-500">
                  Classificar mantém o chamado OPEN e sem responsável.
                </p>
                <label className="form-label">
                  Prioridade
                  <select
                    className="field"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                  >
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                  </select>
                </label>
                <button
                  className="button-primary"
                  onClick={() => open('classify')}
                >
                  Simular classificação
                </button>
              </>
            )}
            {triage && ticket.priority && (
              <button className="button-primary" onClick={() => open('start')}>
                Simular assumir atendimento
              </button>
            )}
            {owns && ticket.status === 'IN_PROGRESS' && (
              <>
                <button
                  className="button-secondary"
                  onClick={() => open('pending')}
                >
                  Adicionar pendência
                </button>
                <button
                  className="button-primary"
                  onClick={() => open('close')}
                >
                  Encerrar atendimento
                </button>
              </>
            )}
            {owns && ticket.status === 'PENDING' && (
              <button className="button-primary" onClick={() => open('resume')}>
                Simular retomada manual
              </button>
            )}
          </div>
        </Panel>
      )}
      {ticket.status === 'CLOSED' && (
        <Panel
          title="Conclusão e registro"
          subtitle="Datas distintas · proposta operacional em validação"
        >
          <dl className="form-body">
            <dt className="detail-label">Conclusão efetiva informada</dt>
            <dd>{actual ? date(actual) : 'Sem registro na amostra'}</dd>
            <dt className="detail-label">Registro original do encerramento</dt>
            <dd>{recorded ? date(recorded) : 'Sem registro na amostra'}</dd>
            {ticket.completionJustification && (
              <>
                <dt className="detail-label">
                  Justificativa do registro posterior
                </dt>
                <dd>{ticket.completionJustification}</dd>
              </>
            )}
          </dl>
          {owns && (
            <div className="px-6 pb-6">
              <button
                className="button-secondary"
                onClick={() => open('correction')}
              >
                Solicitar correção da data de conclusão
              </button>
            </div>
          )}
          {ticket.completionCorrections?.map((request) => (
            <div key={request.id} className="correction-card">
              <strong>Correção solicitada · sem aprovação</strong>
              <dl>
                <dt>Registro original</dt>
                <dd>{date(request.originalRecordedAt)}</dd>
                <dt>Conclusão original</dt>
                <dd>{date(request.originalEffectiveAt)}</dd>
                <dt>Conclusão solicitada</dt>
                <dd>{date(request.requestedEffectiveAt)}</dd>
                <dt>Solicitada em / responsável</dt>
                <dd>
                  {date(request.requestedAt)} · {request.requestedBy}
                </dd>
                <dt>Justificativa</dt>
                <dd>{request.justification}</dd>
              </dl>
              <p>Datas originais preservadas; métricas não recalculadas.</p>
            </div>
          ))}
        </Panel>
      )}
      {operation && (
        <DemoDialog
          title={titles[operation]}
          description={
            operation === 'correction'
              ? 'A solicitação será registrada na amostra. Aprovação e efeitos sobre métricas ainda dependem de decisão. Nenhuma data original será substituída.'
              : 'Confirme a ação somente nesta sessão. Nenhum dado será enviado à API.'
          }
          confirmLabel={
            operation === 'correction'
              ? 'Registrar solicitação de correção'
              : 'Confirmar ação demonstrativa'
          }
          onCancel={() => setOperation(null)}
          onConfirm={confirm}
        >
          {operation === 'classify' && (
            <p className="info-note">
              Prioridade: {priorityLabels[priority]}. Classificação não inicia
              nem atribui o atendimento.
            </p>
          )}
          {operation === 'start' && (
            <p className="info-note">
              O chamado será atribuído a Lucas Ferreira na simulação e ficará
              IN_PROGRESS. A operação real será atômica no backend.
            </p>
          )}
          {operation === 'pending' && (
            <>
              <label className="form-label">
                Motivo da pendência
                <select
                  className="field"
                  value={reasonId}
                  onChange={(e) => setReasonId(e.target.value)}
                >
                  {reasons.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs leading-6 text-slate-500">
                Conta tempo útil no expediente: {reason.counts ? 'sim' : 'não'}.
                Retoma por interação válida do solicitante:{' '}
                {reason.autoResume ? 'sim' : 'não'}.
              </p>
              <label className="form-label">
                Justificativa da pendência *
                <textarea
                  className="field"
                  maxLength={1500}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  aria-invalid={!!error}
                />
              </label>
            </>
          )}
          {(operation === 'close' || operation === 'correction') && (
            <>
              <p className="text-xs leading-6 text-slate-500">
                Primeiro início:{' '}
                {ticket.firstStartedAt
                  ? date(ticket.firstStartedAt)
                  : 'Não informado'}
                . Registro desta ação: momento atual. Não há cálculo de tempo
                útil nesta prévia.
              </p>
              {operation === 'close' && (
                <label className="option-chip">
                  <input
                    type="checkbox"
                    checked={backdated}
                    onChange={(e) => setBackdated(e.target.checked)}
                  />
                  O atendimento foi concluído anteriormente
                </label>
              )}
              {operation === 'correction' && (
                <p className="info-note">
                  Conclusão original: {actual ? date(actual) : 'Não informada'}.
                  Registro original:{' '}
                  {recorded ? date(recorded) : 'Não informado'}.
                </p>
              )}
              {(backdated || operation === 'correction') && (
                <>
                  <label className="form-label">
                    {operation === 'correction'
                      ? 'Data de conclusão solicitada'
                      : 'Data/hora de conclusão efetiva'}{' '}
                    *
                    <input
                      className="field"
                      type="datetime-local"
                      min={
                        ticket.firstStartedAt
                          ? localDateInput(ticket.firstStartedAt)
                          : undefined
                      }
                      max={localDateInput(new Date().toISOString())}
                      value={effective}
                      onInput={(e) => setEffective(e.currentTarget.value)}
                      onChange={(e) => setEffective(e.target.value)}
                      aria-invalid={!!error}
                    />
                  </label>
                  <label className="form-label">
                    Justificativa da data *
                    <textarea
                      className="field"
                      maxLength={1500}
                      value={justification}
                      onChange={(e) => setJustification(e.target.value)}
                    />
                  </label>
                </>
              )}
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </DemoDialog>
      )}
    </>
  );
}
