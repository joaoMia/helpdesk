import { useEffect, useState } from 'react';
import { scrollToContent } from '../lib/motion';
export function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const change = () => setVisible(window.scrollY > 500);
    window.addEventListener('scroll', change, { passive: true });
    return () => window.removeEventListener('scroll', change);
  }, []);
  return visible ? (
    <button
      className="back-to-top"
      aria-label="Voltar ao topo"
      onClick={() => {
        scrollToContent(document.getElementById('smooth-content'));
        document.getElementById('main-content')?.focus({ preventScroll: true });
      }}
    >
      ↑ <span>Topo</span>
    </button>
  ) : null;
}
