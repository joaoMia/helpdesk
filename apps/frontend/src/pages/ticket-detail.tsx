import { date, money } from '../lib/presentation';
import { useState } from 'react';
import type { FormEvent } from 'react';
import type { DemoAction, DemoTicket, Priority, Role } from '../types/demo';
import { reasons, requesterName, technicianName } from '../mocks/fixtures';
import { href } from '../navigation/routes';
import {
  EmptyState,
  Icon,
  PageHeading,
  Panel,
  PriorityBadge,
  StatusBadge,
} from '../components/ui';

export function TicketDetail({
  ticket,
  role,
  onAction,
}: {
  ticket: DemoTicket | undefined;
  role: Role;
  onAction: (action: DemoAction) => void;
}) {
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [reasonId, setReasonId] = useState('p1');
  const [showPending, setShowPending] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [message, setMessage] = useState('');
  const allowed =
    ticket &&
    (role === 'admin' ||
      (role === 'requester'
        ? ticket.requesterId === 'r1'
        : ticket.technicianId === 't1' ||
          (!ticket.technicianId && ticket.status === 'OPEN')));
  if (!ticket || !allowed)
    return (
      <EmptyState title="Chamado indisponível nesta visão">
        <a className="text-button" href={href(role, 'painel')}>
          Voltar à visão geral
        </a>
      </EmptyState>
    );
  const owns = role === 'technician' && ticket.technicianId === 't1';
  const triage = role === 'technician' && !ticket.technicianId;
  const reason = reasons.find((r) => r.id === reasonId)!;
  const pend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const explanation = String(
      new FormData(event.currentTarget).get('explanation') ?? '',
    ).trim();
    if (!explanation) return;
    onAction({ type: 'pending', id: ticket.id, reason, explanation });
    setShowPending(false);
  };
  return (
    <>
      <a
        className="back-link"
        href={href(
          role,
          role === 'technician'
            ? ticket.technicianId
              ? 'atendimentos'
              : ticket.priority
                ? 'classificados'
                : 'nao-classificados'
            : 'chamados',
        )}
      >
        ← Voltar aos chamados
      </a>
      <PageHeading
        eyebrow={`CHAMADO HD-${ticket.id}`}
        title={ticket.subject}
        description={`Aberto em ${date(ticket.createdAt)} · Dados fictícios`}
      >
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
        </div>
      </PageHeading>
      <div className="detail-grid">
        <div className="space-y-6">
          <Panel
            title={triage ? 'Resumo para triagem' : 'Descrição da solicitação'}
          >
            <div className="form-body">
              {triage ? (
                <p className="info-note">
                  Descrição, anexos e histórico completo ficam ocultos nesta
                  visão. A visibilidade definitiva depende da ADR-03.
                  Classifique a prioridade ou assuma um chamado já classificado
                  para explorar o atendimento.
                </p>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
                    {ticket.description}
                  </p>
                  {ticket.attachment && (
                    <p className="mt-4 flex items-center gap-2 break-all text-sm text-slate-500">
                      <Icon name="paper" />
                      {ticket.attachment} · nome ilustrativo, sem upload
                    </p>
                  )}
                </>
              )}
            </div>
          </Panel>
          <Panel
            title="Serviços solicitados"
            subtitle="Nome e valor capturados na amostra; sem cobrança real"
          >
            <div className="form-body space-y-4">
              {ticket.services.map((s) => (
                <div key={s.id} className="flex justify-between gap-4 text-sm">
                  <span className="text-slate-700">{s.name}</span>
                  <strong className="whitespace-nowrap font-medium">
                    {money(s.cents)}
                  </strong>
                </div>
              ))}
              <div className="flex justify-between border-t border-slate-100 pt-4 text-sm font-semibold">
                <span>Total ilustrativo</span>
                <span>
                  {money(
                    ticket.services.reduce((total, s) => total + s.cents, 0),
                  )}
                </span>
              </div>
            </div>
          </Panel>
          {!triage && (
            <Panel
              title="Acompanhamento"
              subtitle="Histórico demonstrativo desta sessão"
            >
              <ol className="timeline">
                {ticket.events.map((e) => (
                  <li key={e.id}>
                    <span className="timeline-dot" />
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="text-sm font-semibold text-slate-800">
                        {e.actor}
                      </span>
                      <time className="text-xs text-slate-400" dateTime={e.at}>
                        {date(e.at)}
                      </time>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-600">
                      {e.text}
                    </p>
                  </li>
                ))}
              </ol>
              {role === 'requester' && ticket.status !== 'CLOSED' && (
                <form
                  className="form-body border-t border-slate-100"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!message.trim()) return;
                    onAction({ type: 'comment', id: ticket.id, text: message });
                    setMessage('');
                  }}
                >
                  <label className="form-label">
                    Adicionar uma mensagem
                    <textarea
                      className="field min-h-24"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      required
                      maxLength={2000}
                      placeholder="Escreva uma mensagem fictícia para testar o acompanhamento."
                    />
                  </label>
                  <button className="button-secondary mt-4" type="submit">
                    Simular envio <Icon name="arrow" />
                  </button>
                  <p className="mt-3 text-xs leading-5 text-slate-500">
                    Sem envio ao servidor. Se o motivo permitir, sua resposta
                    simula a retomada do atendimento.
                  </p>
                </form>
              )}
            </Panel>
          )}
        </div>
        <aside className="space-y-6">
          <Panel title="Informações do chamado">
            <dl className="form-body space-y-5">
              <div>
                <dt className="detail-label">Solicitante</dt>
                <dd>{requesterName(ticket.requesterId)}</dd>
              </div>
              <div>
                <dt className="detail-label">Responsável</dt>
                <dd>{technicianName(ticket.technicianId)}</dd>
              </div>
              <div>
                <dt className="detail-label">Tempo útil total / após início</dt>
                <dd className="text-sm text-slate-500">
                  Não calculado nesta prévia
                </dd>
              </div>
            </dl>
          </Panel>
          {ticket.pending && (
            <section className="pending-note">
              <Icon name="pause" />
              <h2 className="font-semibold">{ticket.pending.name}</h2>
              <p className="mt-2 text-sm leading-6">
                {ticket.pending.counts
                  ? 'Contabiliza tempo útil quando houver expediente.'
                  : 'Não contabiliza o período pendente dentro do expediente.'}
              </p>
              <p className="mt-2 text-xs leading-5">
                Retomada por resposta do solicitante:{' '}
                {ticket.pending.autoResume ? 'sim' : 'não'}. Flags fictícias
                capturadas no início da pendência.
              </p>
            </section>
          )}
          {role === 'technician' && ticket.status !== 'CLOSED' && (
            <Panel
              title="Próximo passo"
              subtitle="Ações simuladas · sem persistência"
            >
              <div className="form-body space-y-4">
                {triage && !ticket.priority && (
                  <>
                    <p className="text-sm leading-6 text-slate-500">
                      Defina a prioridade. Isso mantém o chamado aberto e não
                      atribui um técnico.
                    </p>
                    <label className="form-label">
                      Prioridade
                      <select
                        className="field"
                        value={priority}
                        onChange={(e) =>
                          setPriority(e.target.value as Priority)
                        }
                      >
                        <option value="LOW">Baixa</option>
                        <option value="MEDIUM">Média</option>
                        <option value="HIGH">Alta</option>
                      </select>
                    </label>
                    <button
                      className="button-primary w-full justify-center"
                      onClick={() =>
                        onAction({ type: 'classify', id: ticket.id, priority })
                      }
                    >
                      Simular classificação
                    </button>
                  </>
                )}
                {triage && ticket.priority && (
                  <>
                    <p className="text-sm leading-6 text-slate-500">
                      A prioridade está definida. Assumir atribui este
                      atendimento a Lucas Ferreira.
                    </p>
                    <button
                      className="button-primary w-full justify-center"
                      onClick={() => onAction({ type: 'start', id: ticket.id })}
                    >
                      Simular assumir atendimento
                    </button>
                  </>
                )}
                {owns && ticket.status === 'IN_PROGRESS' && (
                  <>
                    {!showPending && !confirmClose && (
                      <>
                        <button
                          className="button-secondary w-full justify-center"
                          onClick={() => setShowPending(true)}
                        >
                          <Icon name="pause" />
                          Adicionar pendência
                        </button>
                        <button
                          className="button-primary w-full justify-center"
                          onClick={() => setConfirmClose(true)}
                        >
                          <Icon name="check" />
                          Encerrar atendimento
                        </button>
                      </>
                    )}
                    {showPending && (
                      <form className="space-y-4" onSubmit={pend}>
                        <label className="form-label">
                          Motivo
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
                        <p className="text-xs leading-5 text-slate-500">
                          Conta tempo útil: {reason.counts ? 'sim' : 'não'} ·
                          Retoma por resposta:{' '}
                          {reason.autoResume ? 'sim' : 'não'}
                        </p>
                        <label className="form-label">
                          Justificativa *
                          <textarea
                            className="field"
                            name="explanation"
                            required
                            maxLength={1000}
                          />
                        </label>
                        <button
                          className="button-primary w-full justify-center"
                          type="submit"
                        >
                          Simular pendência
                        </button>
                        <button
                          className="text-button text-xs"
                          type="button"
                          onClick={() => setShowPending(false)}
                        >
                          Cancelar
                        </button>
                      </form>
                    )}
                    {confirmClose && (
                      <div className="space-y-4">
                        <p className="text-sm leading-6 text-slate-600">
                          Encerrar este atendimento na prévia? O chamado ficará
                          somente para leitura, sem cálculo de métricas.
                        </p>
                        <button
                          className="button-primary w-full justify-center"
                          onClick={() => {
                            onAction({ type: 'close', id: ticket.id });
                            setConfirmClose(false);
                          }}
                        >
                          Confirmar encerramento simulado
                        </button>
                        <button
                          className="text-button text-xs"
                          onClick={() => setConfirmClose(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </>
                )}
                {owns && ticket.status === 'PENDING' && (
                  <button
                    className="button-primary w-full justify-center"
                    onClick={() => onAction({ type: 'resume', id: ticket.id })}
                  >
                    Simular retomada manual
                  </button>
                )}
              </div>
            </Panel>
          )}
          {(role === 'admin' || ticket.status === 'CLOSED') && (
            <p className="info-note">
              {ticket.status === 'CLOSED'
                ? 'Chamado encerrado: somente leitura. Reabertura não está disponível.'
                : 'Visão administrativa somente para consulta. Poderes de supervisão aguardam decisão nas ADRs.'}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
