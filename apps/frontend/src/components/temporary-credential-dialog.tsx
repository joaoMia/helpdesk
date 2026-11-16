import { useEffect, useState } from 'react';
import { DemoDialog } from './demo-dialog';
export function TemporaryCredentialDialog({
  email,
  password,
  onClose,
}: {
  email: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <DemoDialog
      title="Credencial provisória"
      eyebrow="EXIBIÇÃO ÚNICA"
      description="Entregue ao titular por canal seguro e separado. A troca será obrigatória no primeiro acesso. Fechar remove a credencial desta tela; ela não poderá ser consultada novamente."
      cancelLabel="Fechar e ocultar"
      onCancel={onClose}
    >
      <p className="mb-4 break-all">{email}</p>
      <label className="form-label">
        Senha provisória
        <input
          className="field"
          type="password"
          readOnly
          autoComplete="off"
          value={password}
        />
      </label>
      <button
        className="button-secondary mt-3"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(password);
            setCopied(true);
            setError('');
          } catch {
            setError(
              'Não foi possível copiar. Selecione o campo e copie diretamente.',
            );
          }
        }}
      >
        {copied ? '✓ Copiado!' : 'Copiar senha provisória'}
      </button>
      {copied && (
        <p role="status" className="info-note mt-3">
          Copiada. Apague a área de transferência após a entrega.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </DemoDialog>
  );
}
