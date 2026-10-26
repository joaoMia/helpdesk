import { MotionContext } from '../hooks/use-motion-preference';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motionQuery } from '../lib/motion';
export function MotionProvider({ children }: { children: ReactNode }) {
  const [system, setSystem] = useState(
    () => window.matchMedia(motionQuery).matches,
  );
  const reduced = system;
  useEffect(() => {
    const media = window.matchMedia(motionQuery),
      change = () => setSystem(media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = reduced ? 'reduced' : 'full';
  }, [reduced]);
  return (
    <MotionContext.Provider value={{ reduced, system }}>
      {children}
    </MotionContext.Provider>
  );
}
