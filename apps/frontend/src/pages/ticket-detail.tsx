import { TicketActions } from '../components/ticket-actions';
import { ServiceAnswerSummary } from '../components/service-fields';
import { ExternalTotvs } from '../components/external-totvs';
import { date } from '../lib/presentation';
import { useState } from 'react';
import type { DemoAction, DemoTicket, Role } from '../types/demo';
import { requesterName, technicianName } from '../mocks/fixtures';
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
  onAction: (action: DemoAction) => boolean;
}) {
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
  const triage = role === 'technician' && !ticket.technicianId;
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
                ? 'chamados/classificados'
                : 'chamados/nao-classificados'
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
            title="Serviço solicitado"
            subtitle="Formulário e respostas preservados na abertura"
          >
            <div className="form-body space-y-6">
              <section>
                <p className="eyebrow">{ticket.category.name}</p>
                <h3 className="mb-4 font-semibold">{ticket.service.name}</h3>
                {!triage && (
                  <ServiceAnswerSummary
                    serviceId={ticket.service.id}
                    fields={ticket.service.fields}
                    answers={ticket.answers}
                  />
                )}
              </section>
              {ticket.legacyServices && (
                <p className="info-note">
                  Registro histórico anterior à VIS-003:{' '}
                  {ticket.legacyServices.map((s) => s.name).join(', ')}.
                  Preservado somente para consulta.
                </p>
              )}
            </div>
          </Panel>
          {!triage && (
            <ExternalTotvs ticket={ticket} role={role} onAction={onAction} />
          )}
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
                    if (
                      onAction({
                        type: 'comment',
                        id: ticket.id,
                        text: message,
                      })
                    )
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
          <TicketActions ticket={ticket} role={role} onAction={onAction} />
          {(role === 'admin' || ticket.status === 'CLOSED') && (
            <p className="info-note">
              {ticket.status === 'CLOSED'
                ? 'Chamado encerrado: dados históricos preservados. Solicitações de correção não reabrem o atendimento nem alteram métricas.'
                : 'Visão administrativa somente para consulta. Poderes de supervisão aguardam decisão nas ADRs.'}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
