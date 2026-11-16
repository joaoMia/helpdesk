import { useRef, useState } from 'react';
import type { PublicUser, TicketDetail } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { AssignmentPreviewDialog } from './assignment-preview-dialog';
import { TicketPriorityEditor } from './ticket-priority-editor';

export function TicketOpenActions({
  ticket,
  user,
  onExpired,
  onChanged,
}: {
  ticket: Pick<
    TicketDetail,
    | 'id'
    | 'code'
    | 'status'
    | 'priority'
    | 'assignedTechnicianId'
    | 'firstStartedAt'
  >;
  user: Pick<PublicUser, 'id' | 'role'>;
  onExpired: () => void;
  onChanged: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');
  const startingRef = useRef(false);
  if (
    ticket.status !== 'OPEN' ||
    ticket.firstStartedAt ||
    user.role === 'REQUESTER'
  )
    return null;

  const free = !ticket.assignedTechnicianId;
  const technician = user.role === 'TECHNICIAN';
  const canStart =
    technician && (free || ticket.assignedTechnicianId === user.id);

  async function start() {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setError('');
    try {
      await authClient.startTicket(ticket.id);
      onChanged();
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) onExpired();
      else
        setError(
          e instanceof AuthError
            ? e.message
            : 'Não foi possível iniciar o atendimento. Atualize o chamado.',
        );
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  return (
    <>
      {canStart && ticket.priority && (
        <button
          className="button-primary"
          disabled={starting}
          onClick={() => void start()}
        >
          {starting
            ? 'Iniciando…'
            : free
              ? 'Assumir e iniciar atendimento'
              : 'Iniciar atendimento'}
        </button>
      )}
      {canStart && (
        <TicketPriorityEditor
          id={ticket.id}
          priority={ticket.priority}
          label={
            ticket.priority ? 'Alterar prioridade' : 'Classificar prioridade'
          }
          disabled={starting}
          onExpired={onExpired}
          onSaved={onChanged}
        />
      )}
      {free && ticket.priority && (
        <button
          className="button-secondary"
          disabled={starting}
          onClick={() => setAssigning(true)}
        >
          Atribuir chamado
        </button>
      )}
      {!ticket.priority && (
        <p className="basis-full text-sm text-slate-500">
          A prioridade deve ser classificada antes da atribuição ou do início.
        </p>
      )}
      {!free && !canStart && (
        <p className="basis-full text-sm text-slate-500">
          O técnico responsável pode iniciar este atendimento.
        </p>
      )}
      {error && (
        <p className="form-error basis-full" role="alert">
          {error}
        </p>
      )}
      {assigning && free && ticket.priority && (
        <AssignmentPreviewDialog
          id={ticket.id}
          code={ticket.code}
          priority={ticket.priority}
          onExpired={onExpired}
          onClose={() => setAssigning(false)}
          onAssigned={() => {
            setAssigning(false);
            onChanged();
          }}
        />
      )}
    </>
  );
}
