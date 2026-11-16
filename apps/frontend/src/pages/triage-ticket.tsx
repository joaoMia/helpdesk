import { useEffect, useState } from 'react';
import type { TriageTicket } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import {
  PageHeading,
  Panel,
  PriorityBadge,
  StatusBadge,
} from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { TicketPriorityEditor } from '../components/ticket-priority-editor';
import { date } from '../lib/presentation';
export function TriageTicketPage({
  id,
  onExpired,
}: {
  id: string;
  onExpired: () => void;
}) {
  const [item, setItem] = useState<TriageTicket | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    authClient
      .triageTicket(id)
      .then((t) => {
        if (active) {
          setItem(t);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          setItem(null);
          if (e instanceof AuthError && e.status === 401) onExpired();
          else setError('Chamado não encontrado ou indisponível para triagem.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, onExpired, revision]);
  return (
    <>
      <a className="back-link" href="#/technician/chamados/nao-classificados">
        ← Voltar aos chamados
      </a>
      <PageHeading
        eyebrow="FICHA RESTRITA"
        title={item ? `Chamado HD-${item.code}` : 'Triagem'}
        description="Somente metadados operacionais. Os detalhes privados são liberados conforme a atribuição."
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Carregando ficha…</p>
      ) : (
        item && (
          <MotionRegion motionKey="triage-ticket">
            <Panel title="Classificação">
              <div className="form-body space-y-4">
                <StatusBadge status={item.status} />
                <PriorityBadge priority={item.priority} />
                <p>Aberto em {date(item.createdAt)}</p>
                <p>Responsável: Não atribuído</p>
                <TicketPriorityEditor
                  id={id}
                  priority={item.priority}
                  onExpired={onExpired}
                  onSaved={() => {
                    setRevision((n) => n + 1);
                  }}
                />
              </div>
            </Panel>
          </MotionRegion>
        )
      )}
    </>
  );
}
