import { useRef } from 'react';
import { DemoDialog } from './demo-dialog';
export function ConfirmChange({
  onCancel,
  onConfirm,
  message,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  message: string;
}) {
  const accepted = useRef(false);
  return (
    <DemoDialog
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
