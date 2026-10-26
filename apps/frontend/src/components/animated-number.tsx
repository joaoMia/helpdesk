import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useMotionPreference } from '../hooks/use-motion-preference';
export function AnimatedNumber({
  value,
  suffix = '',
}: {
  value: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null),
    { reduced } = useMotionPreference();
  useGSAP(
    () => {
      if (!ref.current) return;
      const element = ref.current;
      if (reduced) {
        element.textContent =
          Math.round(value).toLocaleString('pt-BR') + suffix;
        return;
      }
      const counter = { value: 0 };
      gsap.to(counter, {
        value,
        duration: 0.85,
        ease: 'power2.out',
        onUpdate: () => {
          element.textContent =
            Math.round(counter.value).toLocaleString('pt-BR') + suffix;
        },
      });
    },
    {
      scope: ref,
      dependencies: [value, reduced, suffix],
      revertOnUpdate: true,
    },
  );
  return (
    <span aria-label={`${value}${suffix}`}>
      <span ref={ref} aria-hidden="true">
        {value}
        {suffix}
      </span>
    </span>
  );
}
