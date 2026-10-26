import { useMotionPreference } from '../hooks/use-motion-preference';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
gsap.registerPlugin(useGSAP);
export function MotionRegion({
  children,
  motionKey,
  className = '',
  reveal = false,
}: {
  children: ReactNode;
  motionKey: string;
  className?: string;
  reveal?: boolean;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const { reduced } = useMotionPreference();
  useGSAP(
    () => {
      const element = scope.current;
      if (element) element.dataset.motionPolicy = reduced ? 'reduced' : 'full';
      if (reduced) return;
      const trace = {
        onStart: () => {
          if (element) {
            element.dataset.motionRuns = String(
              Number(element.dataset.motionRuns ?? 0) + 1,
            );
            element.dataset.motionPhase = 'running';
          }
        },
        onComplete: () => {
          if (element) element.dataset.motionPhase = 'complete';
        },
      };
      const media = gsap.matchMedia();
      media.add('(prefers-reduced-motion: no-preference)', () => {
        const targets = Array.from(
          scope.current?.querySelectorAll('[data-animate]') ?? [],
        ).filter(
          (element) =>
            element.closest('[data-motion-region]') === scope.current,
        );
        if (targets?.length)
          gsap.fromTo(
            targets,
            { y: 24, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.65,
              stagger: 0.09,
              ease: 'power2.out',
              clearProps: 'transform,opacity',
              ...trace,
            },
          );
        else if (
          !reveal &&
          !scope.current?.querySelector('[data-motion-region]')
        )
          gsap.fromTo(
            scope.current,
            { y: 8, opacity: 0.75 },
            {
              y: 0,
              opacity: 1,
              duration: 0.5,
              clearProps: 'transform,opacity',
            },
          );
      });
      return () => media.revert();
    },
    { scope, dependencies: [motionKey, reduced, reveal], revertOnUpdate: true },
  );
  return (
    <div ref={scope} className={className} data-motion-region>
      {children}
    </div>
  );
}
