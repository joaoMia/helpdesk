import { useEffect, useState } from 'react';
import type {
  PublicUser,
  TicketDetail,
  TicketHistory,
} from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import {
  PageHeading,
  Panel,
  PriorityBadge,
  StatusBadge,
} from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { TicketPagination } from '../components/ticket-pagination';
import { date } from '../lib/presentation';
export function RequesterTicketDetail({
  id,
  user,
  onExpired,
  created = false,
}: {
  id: string;
  user: PublicUser;
  onExpired: () => void;
  created?: boolean;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null),
    [history, setHistory] = useState<TicketHistory | null>(null),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    Promise.all([authClient.ticket(id), authClient.ticketHistory(id, page, 10)])
      .then(([t, h]) => {
        if (active) {
          setTicket(t);
          setHistory(h);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else {
            setTicket(null);
            setHistory(null);
            setError(
              e instanceof AuthError && e.status === 404
                ? 'Chamado não encontrado ou indisponível para sua conta.'
                : 'Não foi possível carregar o chamado. Tente novamente.',
            );
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, page, revision, onExpired]);
  return (
    <>
      <a className="back-link" href="#/requester/chamados">
        ← Voltar aos chamados
      </a>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status" className="panel p-6">
          Carregando chamado…
        </p>
      ) : ticket ? (
        <>
          {created && (
            <p role="status" className="info-note mb-5">
              Chamado HD-{ticket.code} registrado com sucesso.
            </p>
          )}
          <PageHeading
            eyebrow={`CHAMADO HD-${ticket.code}`}
            title={ticket.subject}
            description={`Aberto em ${date(ticket.createdAt)}`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
            </div>
          </PageHeading>
          <MotionRegion motionKey={'real-ticket-detail-' + id}>
            <div className="detail-grid">
              <div className="space-y-6">
                <Panel title="Descrição da solicitação">
                  <div className="form-body">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
                      {ticket.description}
                    </p>
                  </div>
                </Panel>
                <Panel
                  title="Serviço solicitado"
                  subtitle="Informações preservadas no momento da abertura"
                >
                  <div className="form-body space-y-6">
                    <section>
                      <p className="eyebrow">
                        {ticket.serviceSnapshot.categoryName}
                      </p>
                      <h3 className="mb-4 font-semibold">
                        {ticket.serviceSnapshot.serviceName}
                      </h3>
                      <p className="text-sm text-slate-500">
                        {ticket.serviceSnapshot.serviceDescription}
                      </p>
                      <p className="mt-4 text-xs text-slate-500">
                        Formulário · versão {ticket.serviceSnapshot.formVersion}
                      </p>
                      {!ticket.serviceSnapshot.fields.length ? (
                        <p className="mt-3 text-sm">Sem campos adicionais.</p>
                      ) : (
                        <dl className="space-y-3 mt-3">
                          {ticket.serviceSnapshot.fields.map((f) => (
                            <div key={f.id}>
                              <dt className="detail-label">{f.label}</dt>
                              <dd>
                                {String(
                                  ticket.answers.find(
                                    (a) => a.fieldKey === f.key,
                                  )?.value ?? 'Não informado',
                                )}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </section>
                  </div>
                </Panel>
                <Panel
                  title="Acompanhamento"
                  subtitle="Histórico registrado no HelpDesk"
                >
                  <ol className="timeline">
                    {history?.items.map((event) => (
                      <li key={event.id}>
                        <span className="timeline-dot" />
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="text-sm font-semibold text-slate-800">
                            {event.actorId === user.id
                              ? user.name
                              : 'Equipe de suporte'}
                          </span>
                          <time
                            className="text-xs text-slate-400"
                            dateTime={event.createdAt}
                          >
                            {date(event.createdAt)}
                          </time>
                        </div>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {event.eventType === 'OPENED'
                            ? 'Chamado aberto. Aguardando classificação.'
                            : `Evento registrado: ${event.eventType}`}
                        </p>
                      </li>
                    ))}
                  </ol>
                  {history && !history.items.length && (
                    <p className="form-body">
                      Nenhum evento disponível nesta página.
                    </p>
                  )}
                  <TicketPagination
                    page={page}
                    total={history?.total ?? 0}
                    busy={loading}
                    onPage={(p) => {
                      setPage(p);
                      setLoading(true);
                    }}
                  />
                  <p className="info-note m-5">
                    Comentários, anexos e ações de atendimento não estão
                    disponíveis nesta etapa.
                  </p>
                </Panel>
              </div>
              <aside className="space-y-6">
                <Panel title="Informações do chamado">
                  <dl className="form-body space-y-5">
                    <div>
                      <dt className="detail-label">Solicitante</dt>
                      <dd>{user.name}</dd>
                    </div>
                    <div>
                      <dt className="detail-label">Responsável</dt>
                      <dd>
                        {ticket.assignedTechnicianId
                          ? 'Técnico atribuído'
                          : 'Sem responsável'}
                      </dd>
                    </div>
                    <div>
                      <dt className="detail-label">
                        Tempo útil total / após início
                      </dt>
                      <dd className="text-sm text-slate-500">
                        Cálculo ainda não disponível.
                      </dd>
                    </div>
                  </dl>
                </Panel>
                <button
                  className="button-secondary"
                  onClick={() => {
                    setLoading(true);
                    setRevision((n) => n + 1);
                  }}
                >
                  Atualizar acompanhamento
                </button>
              </aside>
            </div>
          </MotionRegion>
        </>
      ) : null}
      {error && (
        <button
          className="button-secondary mt-4"
          onClick={() => {
            setLoading(true);
            setRevision((n) => n + 1);
          }}
        >
          Tentar novamente
        </button>
      )}
    </>
  );
}
