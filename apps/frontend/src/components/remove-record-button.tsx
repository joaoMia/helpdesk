import { Icon } from './ui';
import { useRef, useState } from 'react';
import { DemoDialog } from './demo-dialog';
import { authClient, AuthError } from '../lib/auth-client';

export function RemoveRecordButton({
  kind,
  id,
  code,
  label = 'Retirar da operação',
  disabled = false,
  title,
  onRemoved,
  onExpired,
}: {
  kind: 'ticket' | 'category' | 'service' | 'user';
  id: string;
  code?: number;
  label?: string;
  disabled?: boolean;
  title?: string;
  onRemoved: () => void;
  onExpired: () => void;
}) {
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const lock = useRef(false);
  async function remove() {
    if (lock.current) return;
    if (kind !== 'user' && reason.trim().length < 3) {
      setError('Informe um motivo para a retirada.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      if (kind === 'user') await authClient.deleteAdminUser(id);
      else await authClient.retireRecord(kind, id, reason);
      setOpen(false);
      onRemoved();
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) onExpired();
      else
        setError(
          e instanceof AuthError
            ? e.message
            : 'Não foi possível confirmar a operação.',
        );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="text-button"
        disabled={disabled}
        title={title}
        aria-disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          setError('');
          setReason('');
        }}
      >
        {(kind === 'ticket' || kind === 'user') && <Icon name="trash" />}
        {label}
      </button>
      {open && (
        <DemoDialog
          title={
            kind === 'user'
              ? 'Excluir conta sem histórico?'
              : kind === 'ticket'
                ? 'Excluir chamado HD-' + code + '?'
                : 'Retirar registro da operação?'
          }
          eyebrow="CONFIRMAÇÃO AUDITADA"
          description={
            kind === 'user'
              ? 'Somente contas sem vínculos ou sessões podem ser excluídas. Contas com histórico devem ser desativadas.'
              : 'O registro deixará de aparecer para todos. O histórico e os snapshots serão preservados, sem exclusão física.'
          }
          pending={busy}
          confirmLabel={
            busy
              ? 'Confirmando…'
              : kind === 'ticket'
                ? 'Confirmar exclusão'
                : 'Confirmar retirada'
          }
          onCancel={() => {
            if (!lock.current) setOpen(false);
          }}
          onConfirm={() => {
            void remove();
            return false;
          }}
        >
          {kind !== 'user' && (
            <label className="form-label">
              Motivo
              <textarea
                className="field"
                value={reason}
                maxLength={1000}
                disabled={busy}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </DemoDialog>
      )}
    </>
  );
}
