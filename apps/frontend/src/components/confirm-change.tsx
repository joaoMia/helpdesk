import { useRef } from 'react';
import { DemoDialog } from './demo-dialog';
export function ConfirmChange({
  onCancel,
  onConfirm,
  message,
  demonstration = true,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  message: string;
  demonstration?: boolean;
}) {
  const accepted = useRef(false);
  return (
    <DemoDialog
      eyebrow={demonstration ? undefined : 'RASCUNHO DO CHAMADO'}
      title="Trocar a seleção?"
      description={message}
      confirmLabel="Descartar e trocar"
      cancelLabel="Manter rascunho"
      onConfirm={() => {
        accepted.current = true;
      }}
      onCancel={() => (accepted.current ? onConfirm() : onCancel())}
    />
  );
}
