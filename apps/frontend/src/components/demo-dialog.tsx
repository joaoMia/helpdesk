import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useMotionPreference } from '../hooks/use-motion-preference';
export function DemoDialog({
  title,
  description,
  children,
  confirmLabel = 'Confirmar simulação',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
  eyebrow = 'AÇÃO DEMONSTRATIVA · SOMENTE NA SESSÃO',
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => boolean | void;
  onCancel: () => void;
  eyebrow?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId(),
    descriptionId = useId(),
    busy = useRef(false);
  const { reduced } = useMotionPreference();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      dialog = ref.current;
    dialog?.showModal();
    dialog
      ?.querySelector<HTMLElement>(
        '[data-initial-focus], input, select, textarea, button',
      )
      ?.focus();
    return () => {
      dialog?.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      else
        document.getElementById('page-title')?.focus({ preventScroll: true });
    };
  }, []);
  const { contextSafe } = useGSAP(
    () => {
      if (!reduced)
        gsap.fromTo(
          ref.current,
          { y: 24, opacity: 0, scale: 0.97 },
          {
            y: 0,
            opacity: 1,
            scale: 1,
            duration: 0.4,
            ease: 'power3.out',
            clearProps: 'transform,opacity',
          },
        );
    },
    { scope: ref, dependencies: [reduced], revertOnUpdate: true },
  );
  function close() {
    contextSafe(() => {
      if (busy.current) return;
      busy.current = true;
      if (reduced) onCancel();
      else
        gsap.to(ref.current, {
          opacity: 0,
          y: 12,
          scale: 0.98,
          duration: 0.2,
          onComplete: onCancel,
        });
    })();
  }
  return createPortal(
    <dialog
      ref={ref}
      className="confirm-dialog demo-dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <span className="eyebrow">{eyebrow}</span>
      <h2 id={titleId}>{title}</h2>
      {description && <p id={descriptionId}>{description}</p>}
      <div className="dialog-content">{children}</div>
      <div className="form-actions">
        <button className="button-secondary" data-initial-focus onClick={close}>
          {cancelLabel}
        </button>
        {onConfirm && (
          <button
            className="button-primary"
            onClick={() => {
              if (busy.current) return;
              if (onConfirm() !== false) close();
            }}
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </dialog>,
    document.body,
  );
}
