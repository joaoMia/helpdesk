import { useEffect, useState } from 'react';
import { resolveTheme, themeKey } from '../lib/theme';
import type { Theme } from '../lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );
  const [warning, setWarning] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(themeKey);
      } catch {
        /* preferência em memória */
      }
      const next = resolveTheme(saved, media.matches);
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    const storage = (event: StorageEvent) => {
      if (event.key === themeKey) apply();
    };
    media.addEventListener('change', apply);
    window.addEventListener('storage', storage);
    return () => {
      media.removeEventListener('change', apply);
      window.removeEventListener('storage', storage);
    };
  }, []);
  const dark = theme === 'dark';
  return (
    <div>
      <button
        type="button"
        className="theme-toggle"
        aria-label="Modo escuro"
        aria-pressed={dark}
        title={dark ? 'Usar tema claro' : 'Usar tema escuro'}
        onClick={() => {
          const next = dark ? 'light' : 'dark';
          document.documentElement.dataset.theme = next;
          setTheme(next);
          try {
            localStorage.setItem(themeKey, next);
            setWarning(false);
          } catch {
            setWarning(true);
          }
        }}
      >
        <span aria-hidden="true">{dark ? '☾' : '☀'}</span>
        <span className="hidden sm:inline">{dark ? 'Escuro' : 'Claro'}</span>
      </button>
      {warning && (
        <span className="sr-only" role="status">
          Preferência aplicada somente nesta página; armazenamento indisponível.
        </span>
      )}
    </div>
  );
}
