import { useRef, useState } from 'react';
import type { TriageTicket } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { priorityLabels } from '../lib/presentation';
import { DemoDialog } from './demo-dialog';

export function TicketPriorityEditor({
  id,
  priority,
  onSaved,
  onExpired,
  label = 'Prioridade',
  disabled = false,
}: {
  label?: string;
  disabled?: boolean;
  id: string;
  priority: TriageTicket['priority'];
  onSaved: () => void;
  onExpired: () => void;
}) {
  const [open, setOpen] = useState(false),
    [choice, setChoice] = useState<NonNullable<TriageTicket['priority']>>(
      priority ?? 'MEDIUM',
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const sending = useRef(false);
  async function save() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      await authClient.classifyPriority(id, {
        priority: choice,
        expectedPriority: priority,
      });
      setOpen(false);
      onSaved();
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) onExpired();
      else
        setError(
          e instanceof AuthError
            ? e.message
            : 'Não foi possível confirmar a prioridade. Atualize a ficha.',
        );
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="button-secondary"
        disabled={disabled}
        onClick={() => {
          setChoice(priority ?? 'MEDIUM');
          setOpen(true);
        }}
      >
        {label}
      </button>
      {open && (
        <DemoDialog
          title="Classificar prioridade"
          eyebrow="ALTERAÇÃO AUDITADA"
          description="A prioridade será gravada sem iniciar ou atribuir o atendimento."
          pending={busy}
          confirmLabel={busy ? 'Salvando…' : 'Confirmar prioridade'}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            void save();
            return false;
          }}
        >
          <label className="form-label">
            Prioridade
            <select
              className="field"
              disabled={busy}
              value={choice}
              onChange={(e) => setChoice(e.target.value as typeof choice)}
            >
              {Object.entries(priorityLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
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
