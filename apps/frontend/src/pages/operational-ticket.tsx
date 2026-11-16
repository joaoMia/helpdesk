import { useEffect, useState } from 'react';
import type { OperationalTicket } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import {
  PageHeading,
  Panel,
  StatusBadge,
  PriorityBadge,
} from '../components/ui';
import { TicketPriorityEditor } from '../components/ticket-priority-editor';
import { AssignmentPreviewDialog } from '../components/assignment-preview-dialog';
import { date } from '../lib/presentation';

export function OperationalTicketPage({
  id,
  onExpired,
}: {
  id: string;
  onExpired: () => void;
}) {
  const [item, setItem] = useState<OperationalTicket | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [assigning, setAssigning] = useState(false);
  useEffect(() => {
    let active = true;
    authClient
      .operationalTicket(id)
      .then((t) => {
        if (active) {
          setItem(t);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else {
            setItem(null);
            setError(
              'Chamado não encontrado ou fora do seu escopo operacional.',
            );
          }
        }
      });
    return () => {
      active = false;
    };
  }, [id, revision, onExpired]);
  return (
    <>
      <a className="back-link" href="#/technician/chamados/todos">
        ← Voltar a Todos
      </a>
      <PageHeading
        eyebrow="VISÃO OPERACIONAL"
        title={item ? 'Chamado HD-' + item.code : 'Chamado'}
        description="Contexto de triagem. Conversa, respostas e arquivos privados dependem da atribuição autorizada."
      />
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!item && !error && <p role="status">Consultando chamado…</p>}
      {item && (
        <Panel
          title={
            [item.categoryName, item.serviceName].filter(Boolean).join(' > ') ||
            'Contexto operacional'
          }
        >
          <div className="form-body space-y-4">
            <StatusBadge status={item.status} />
            <PriorityBadge priority={item.priority} />
            <p>
              {item.requesterName} ·{' '}
              {item.departmentName ?? 'Setor não informado'} ·{' '}
              {item.companyName ?? 'Empresa não informada'}
            </p>
            <p>Responsável: {item.responsibleName ?? 'Não atribuído'}</p>
            <p>Abertura: {date(item.createdAt)}</p>
            {item.canRetire && (
              <a className="button-primary" href={'#/technician/chamado/' + id}>
                Abrir meu atendimento
              </a>
            )}
            {item.status === 'OPEN' && !item.responsibleName && (
              <>
                <TicketPriorityEditor
                  id={id}
                  priority={item.priority}
                  onExpired={onExpired}
                  onSaved={() => setRevision((n) => n + 1)}
                />
                {item.priority && (
                  <button
                    className="button-secondary"
                    onClick={() => setAssigning(true)}
                  >
                    Atribuir chamado
                  </button>
                )}
              </>
            )}
          </div>
        </Panel>
      )}
      {assigning && item?.priority && (
        <AssignmentPreviewDialog
          id={id}
          code={item.code}
          priority={item.priority}
          onExpired={onExpired}
          onClose={() => setAssigning(false)}
          onAssigned={() => {
            setAssigning(false);
            setRevision((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
