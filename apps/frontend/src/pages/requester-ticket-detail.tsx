import { visibleFormKeys } from '@helpdesk/contracts';
import { useEffect, useState } from 'react';
import type { PublicUser, TicketDetail } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import {
  PageHeading,
  Panel,
  PriorityBadge,
  StatusBadge,
} from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { date } from '../lib/presentation';
import { TicketOpenActions } from '../components/ticket-open-actions';
import { TicketPriorityEditor } from '../components/ticket-priority-editor';
import { TicketHistoryPanel } from '../components/ticket-history-panel';
import { TicketConversation } from '../components/ticket-conversation';
import { TicketLifecycle } from '../components/ticket-lifecycle';
export function RequesterTicketDetail({
  id,
  user,
  onExpired,
  created = false,
  technician = false,
}: {
  id: string;
  user: PublicUser;
  onExpired: () => void;
  created?: boolean;
  technician?: boolean;
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const [solutionOpen, setSolutionOpen] = useState(false);
  const responsible =
    user.role === 'TECHNICIAN' && ticket?.assignedTechnicianId === user.id;
  const reload = () => setRevision((n) => n + 1);
  useEffect(() => {
    let active = true;
    authClient
      .ticket(id)
      .then((t) => {
        if (active) {
          setTicket(t);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else {
            setTicket(null);
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
  }, [id, revision, onExpired]);
  return (
    <>
      <a
        className="back-link"
        href={
          user.role === 'ADMIN'
            ? '#/admin/chamados'
            : technician
              ? '#/technician/atendimentos'
              : '#/requester/chamados'
        }
      >
        {technician
          ? '← Voltar aos meus atendimentos'
          : '← Voltar aos chamados'}
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
            <div className="mb-6">
              <TicketLifecycle
                id={id}
                status={ticket.status}
                createdAt={ticket.createdAt}
                resolvedAt={ticket.resolvedAt ?? null}
                canOperate={responsible}
                canClose={responsible || user.role === 'ADMIN'}
                refreshKey={revision}
                additionalActions={
                  ticket.status === 'OPEN' && user.role !== 'REQUESTER' ? (
                    <TicketOpenActions
                      ticket={ticket}
                      user={user}
                      onExpired={onExpired}
                      onChanged={reload}
                    />
                  ) : responsible &&
                    (ticket.status === 'IN_PROGRESS' ||
                      ticket.status === 'PENDING') ? (
                    <TicketPriorityEditor
                      id={ticket.id}
                      priority={ticket.priority}
                      label="Alterar prioridade"
                      onExpired={onExpired}
                      onSaved={reload}
                    />
                  ) : null
                }
                onSolve={() => setSolutionOpen(true)}
                onExpired={onExpired}
                onChanged={reload}
              />
            </div>
            <div className="detail-grid items-start">
              <div className="min-w-0 space-y-6">
                <Panel title="Solicitação e contexto">
                  <div className="form-body">
                    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600 dark:text-slate-300">
                      {ticket.description}
                    </p>
                  </div>
                  <h3 className="px-6 mt-4 font-semibold">
                    Serviço solicitado · contexto histórico
                  </h3>
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
                          {ticket.serviceSnapshot.fields
                            .filter((f) =>
                              visibleFormKeys(
                                ticket.serviceSnapshot.fields,
                                Object.fromEntries(
                                  ticket.answers.map((a) => [
                                    a.fieldKey,
                                    a.value,
                                  ]),
                                ),
                              ).has(f.key),
                            )
                            .map((f) => (
                              <div key={f.id}>
                                <dt className="detail-label">{f.label}</dt>
                                <dd>
                                  {f.type === 'FILE'
                                    ? Array.isArray(
                                        ticket.answers.find(
                                          (a) => a.fieldKey === f.key,
                                        )?.value,
                                      ) &&
                                      (
                                        ticket.answers.find(
                                          (a) => a.fieldKey === f.key,
                                        )!.value as string[]
                                      ).length
                                      ? 'Arquivo(s) enviado(s). Consulte os anexos da abertura na conversa abaixo.'
                                      : 'Nenhum arquivo informado.'
                                    : String(
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
                <TicketConversation
                  key={user.id + ':' + id}
                  id={id}
                  status={ticket.status}
                  user={user}
                  onExpired={onExpired}
                  onChanged={reload}
                  allowSolve={responsible && ticket.status === 'IN_PROGRESS'}
                  solutionControl={{
                    open: solutionOpen,
                    onOpenChange: setSolutionOpen,
                  }}
                />
                <TicketHistoryPanel
                  key={id}
                  id={id}
                  revision={revision}
                  onExpired={onExpired}
                />
              </div>
              <aside className="min-w-0 space-y-6">
                <Panel title="Informações do chamado">
                  <dl className="form-body space-y-5">
                    <div>
                      <dt className="detail-label">Abertura</dt>
                      <dd>{date(ticket.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="detail-label">Status e prioridade</dt>
                      <dd className="flex flex-wrap gap-2">
                        <StatusBadge status={ticket.status} />
                        <PriorityBadge priority={ticket.priority} />
                      </dd>
                    </div>
                    {
                      <div>
                        <dt className="detail-label">Solicitante</dt>
                        <dd>
                          {ticket.requesterName ??
                            (user.id === ticket.requesterId
                              ? user.name
                              : 'Solicitante do chamado')}
                        </dd>
                      </div>
                    }
                    <div>
                      <dt className="detail-label">Responsável</dt>
                      <dd>
                        {ticket.responsibleName ??
                          (ticket.assignedTechnicianId === user.id
                            ? user.name
                            : ticket.assignedTechnicianId
                              ? 'Técnico atribuído'
                              : 'Sem responsável')}
                      </dd>
                    </div>
                    {ticket.firstStartedAt && (
                      <div>
                        <dt className="detail-label">Primeiro atendimento</dt>
                        <dd>
                          <time dateTime={ticket.firstStartedAt}>
                            {date(ticket.firstStartedAt)}
                          </time>
                        </dd>
                      </div>
                    )}
                    {ticket.resolvedAt && (
                      <div>
                        <dt className="detail-label">Solução registrada</dt>
                        <dd>{date(ticket.resolvedAt)}</dd>
                      </div>
                    )}
                  </dl>
                </Panel>
                <button
                  className="button-secondary"
                  onClick={() => {
                    setRevision((n) => n + 1);
                  }}
                >
                  Atualizar chamado
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
            setRevision((n) => n + 1);
          }}
        >
          Tentar novamente
        </button>
      )}
    </>
  );
}
