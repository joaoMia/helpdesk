import { useRef } from 'react';
import type { ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useMotionPreference } from '../hooks/use-motion-preference';
export function AnimatedPanel({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null),
    { reduced } = useMotionPreference();
  useGSAP(
    () => {
      const element = ref.current;
      if (!element) return;
      gsap.to(element, {
        height: open ? 'auto' : 0,
        opacity: open ? 1 : 0,
        duration: reduced ? 0 : 0.35,
        ease: 'power2.inOut',
        overwrite: true,
      });
    },
    { scope: ref, dependencies: [open, reduced], revertOnUpdate: true },
  );
  return (
    <div
      ref={ref}
      className="animated-panel"
      aria-hidden={!open}
      inert={!open}
      style={{ height: 0, opacity: 0, overflow: 'hidden' }}
    >
      {children}
    </div>
  );
}
