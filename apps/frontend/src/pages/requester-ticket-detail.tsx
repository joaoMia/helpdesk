import { useEffect, useState } from 'react';
import type { PublicUser, TicketDetail } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { Icon, PriorityBadge, StatusBadge } from '../components/ui';
import { DemoDialog } from '../components/demo-dialog';
import { TicketOpenActions } from '../components/ticket-open-actions';
import { TicketPriorityEditor } from '../components/ticket-priority-editor';
import { TicketHistoryPanel } from '../components/ticket-history-panel';
import { TicketConversation } from '../components/ticket-conversation';
import { TicketLifecycle } from '../components/ticket-lifecycle';

const sidebarViewport = '(min-width: 1024px) and (min-height: 640px)';

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
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [solutionOpen, setSolutionOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sidebar, setSidebar] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia(sidebarViewport).matches,
  );
  const responsible =
    user.role === 'TECHNICIAN' && ticket?.assignedTechnicianId === user.id;
  const reload = () => setRevision((n) => n + 1);

  useEffect(() => {
    const query = window.matchMedia(sidebarViewport);
    const update = () => {
      setSidebar(query.matches);
      if (query.matches) setInfoOpen(false);
    };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

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

  const requester =
    ticket?.requesterName ??
    (user.id === ticket?.requesterId ? user.name : 'Solicitante do chamado');
  const assignee =
    ticket?.responsibleName ??
    (ticket?.assignedTechnicianId === user.id
      ? user.name
      : ticket?.assignedTechnicianId
        ? 'Técnico atribuído'
        : 'Sem responsável');
  const badges = ticket && (
    <>
      <StatusBadge status={ticket.status} />
      <PriorityBadge priority={ticket.priority} />
    </>
  );
  const information = ticket && (
    <div className="ticket-info-content">
      <dl className="ticket-info-people">
        <div>
          <dt>Status e prioridade</dt>
          <dd className="flex flex-wrap gap-1.5">{badges}</dd>
        </div>
        <div>
          <dt>Solicitante</dt>
          <dd>{requester}</dd>
        </div>
        <div>
          <dt>Responsável técnico</dt>
          <dd>{assignee}</dd>
        </div>
      </dl>
      <TicketLifecycle
        id={id}
        status={ticket.status}
        createdAt={ticket.createdAt}
        firstStartedAt={ticket.firstStartedAt}
        resolvedAt={ticket.resolvedAt ?? null}
        closedAt={ticket.closedAt}
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
            (ticket.status === 'IN_PROGRESS' || ticket.status === 'PENDING') ? (
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
      <div className="ticket-info-links">
        <button type="button" className="button-secondary" onClick={reload}>
          Atualizar chamado
        </button>
        <button
          type="button"
          className="button-secondary"
          aria-haspopup="dialog"
          onClick={() => setHistoryOpen(true)}
        >
          Histórico do chamado
        </button>
      </div>
    </div>
  );

  return (
    <div className="ticket-detail">
      <header className="ticket-detail-header">
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
        {ticket && (
          <>
            <div className="ticket-detail-heading">
              <span className="ticket-detail-code">HD-{ticket.code}</span>
              <h1 id="page-title" tabIndex={-1} title={ticket.subject}>
                {ticket.subject}
              </h1>
            </div>
            <div className="ticket-detail-header-controls">
              <div className="ticket-header-badges flex flex-wrap gap-1.5">
                {badges}
              </div>
              {!sidebar && (
                <button
                  type="button"
                  className="button-secondary ticket-info-trigger"
                  aria-label="Informações do chamado"
                  aria-haspopup="dialog"
                  onClick={() => setInfoOpen(true)}
                >
                  <Icon name="chevron" />
                  <span>
                    Informações
                    <span className="max-[359px]:sr-only"> do chamado</span>
                  </span>
                </button>
              )}
            </div>
          </>
        )}
      </header>
      {created && ticket && (
        <p role="status" className="ticket-created-note">
          Chamado HD-{ticket.code} registrado com sucesso.
        </p>
      )}
      {error && (
        <div className="space-y-3">
          <p role="alert" className="form-error">
            {error}
          </p>
          <button className="button-secondary" onClick={reload}>
            Tentar novamente
          </button>
        </div>
      )}
      {loading ? (
        <p role="status" className="panel p-4">
          Carregando chamado…
        </p>
      ) : ticket ? (
        <div
          className={
            sidebar
              ? 'ticket-detail-grid ticket-detail-with-sidebar'
              : 'ticket-detail-grid'
          }
        >
          <div className="ticket-detail-conversation">
            <TicketConversation
              key={user.id + ':' + id}
              id={id}
              status={ticket.status}
              user={user}
              onExpired={onExpired}
              onChanged={reload}
              opening={{ ticket, requester }}
              allowSolve={responsible && ticket.status === 'IN_PROGRESS'}
              solutionControl={{
                open: solutionOpen,
                onOpenChange: setSolutionOpen,
              }}
            />
          </div>
          {sidebar ? (
            <aside
              className="panel ticket-info-panel"
              aria-labelledby="ticket-info-title"
            >
              <h2 id="ticket-info-title">Informações do chamado</h2>
              {information}
            </aside>
          ) : (
            infoOpen && (
              <DemoDialog
                title="Informações do chamado"
                eyebrow=""
                className="ticket-info-dialog"
                cancelLabel="Voltar à conversa"
                onCancel={() => setInfoOpen(false)}
              >
                {information}
              </DemoDialog>
            )
          )}
          {historyOpen && (
            <DemoDialog
              title="Histórico do chamado"
              eyebrow=""
              cancelLabel="Fechar"
              onCancel={() => setHistoryOpen(false)}
            >
              <TicketHistoryPanel
                id={id}
                revision={revision}
                onExpired={onExpired}
              />
            </DemoDialog>
          )}
        </div>
      ) : null}
    </div>
  );
}
