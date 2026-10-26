import { NotificationContext } from '../hooks/use-notifications';
import type { Notice, NoticeTone } from '../hooks/use-notifications';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useMotionPreference } from '../hooks/use-motion-preference';
import { Icon } from './ui';
const labels = {
  success: 'Simulação concluída',
  error: 'Não foi possível concluir',
  warning: 'Atenção',
  info: 'Informação',
};
function Toast({ notice, onRemove }: { notice: Notice; onRemove: () => void }) {
  const ref = useRef<HTMLDivElement>(null),
    leaving = useRef(false),
    { reduced } = useMotionPreference();
  const [paused, setPaused] = useState(false);
  const { contextSafe } = useGSAP(
    () => {
      if (!reduced)
        gsap.fromTo(
          ref.current,
          { opacity: 0, x: 32, y: 8 },
          {
            opacity: 1,
            x: 0,
            y: 0,
            duration: 0.42,
            ease: 'power3.out',
            clearProps: 'transform,opacity',
          },
        );
    },
    { scope: ref, dependencies: [reduced], revertOnUpdate: true },
  );
  const dismiss = useCallback(() => {
    contextSafe(() => {
      if (leaving.current) return;
      leaving.current = true;
      if (reduced) onRemove();
      else
        gsap.to(ref.current, {
          x: 24,
          opacity: 0,
          duration: 0.22,
          onComplete: onRemove,
        });
    })();
  }, [contextSafe, onRemove, reduced]);
  useEffect(() => {
    if (paused || notice.tone === 'error') return;
    const timer = window.setTimeout(
      dismiss,
      notice.tone === 'success' ? 6500 : 9500,
    );
    return () => window.clearTimeout(timer);
  }, [paused, notice.tone, dismiss]);
  return (
    <div
      ref={ref}
      className={`toast toast-${notice.tone}`}
      role={notice.tone === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setPaused(false);
      }}
    >
      <span className="toast-icon">
        <Icon
          name={
            notice.tone === 'success'
              ? 'check'
              : notice.tone === 'error'
                ? 'close'
                : notice.tone === 'warning'
                  ? 'pause'
                  : 'ticket'
          }
        />
      </span>
      <div>
        <strong>{labels[notice.tone]}</strong>
        <p>{notice.message}</p>
      </div>
      <button
        className="icon-button"
        aria-label="Fechar notificação"
        onClick={dismiss}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  function notify(tone: NoticeTone, message: string) {
    setNotices((current) => [
      ...current.slice(-2),
      { id: crypto.randomUUID(), tone, message },
    ]);
  }
  return (
    <NotificationContext.Provider value={{ notify }}>
      {children}
      <div className="toast-stack" aria-label="Notificações">
        {notices.map((notice) => (
          <Toast
            key={notice.id}
            notice={notice}
            onRemove={() =>
              setNotices((current) => current.filter((n) => n.id !== notice.id))
            }
          />
        ))}
      </div>
    </NotificationContext.Provider>
  );
}
