import { SmoothWorkspace } from '../components/smooth-workspace';
import { scrollToContent } from '../lib/motion';
import { BackToTop } from '../components/back-to-top';
import { ThemeToggle } from '../components/theme-toggle';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Role } from '../types/demo';
import { href, navigation } from '../navigation/routes';
import { roles } from '../mocks/fixtures';
import { Icon } from '../components/ui';
import { useApiHealth } from '../hooks/use-api-health';

export function AppShell({
  role,
  page,
  children,
  onReset,
}: {
  role: Role;
  page: string;
  children: ReactNode;
  onReset: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const health = useApiHealth();
  const actor = roles[role];
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) {
        setMenu(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          scrollToContent(document.getElementById('main-content'), true);
        }}
      >
        Ir para o conteúdo
      </a>
      <aside
        className={`sidebar ${menu ? 'sidebar-open' : ''}`}
        aria-label="Navegação principal"
      >
        <a
          className="brand"
          href={href(role, 'painel')}
          onClick={() => setMenu(false)}
        >
          <span className="brand-mark">
            <Icon name="ticket" />
          </span>
          HelpDesk<span className="brand-dot">.</span>
        </a>
        <p className="nav-caption">ESPAÇO DE TRABALHO</p>
        <div className="workspace-label">
          <span className="size-2 rounded-full bg-teal-300" />
          {actor.label}
          <span className="ml-auto text-[10px] text-slate-400">PRÉVIA</span>
        </div>
        <p className="nav-caption mt-8">PRINCIPAL</p>
        <nav>
          {navigation[role].map((item) => (
            <a
              key={item.path}
              href={href(role, item.path)}
              aria-current={page === item.path ? 'page' : undefined}
              className={`nav-item ${page === item.path ? 'nav-active' : ''}`}
              onClick={() => setMenu(false)}
            >
              <Icon name={item.icon} />
              {item.label}
              {page === item.path && (
                <span className="ml-auto size-1.5 rounded-full bg-teal-300" />
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <span className="text-xs font-semibold text-teal-200">
              Feito para apoiar sua rotina
            </span>
            <p className="mt-2 text-xs leading-5 text-slate-400">
              Do primeiro pedido ao atendimento concluído. Um lugar para
              acompanhar tudo.
            </p>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <span className="avatar bg-teal-900 text-teal-100">
              {actor.initials}
            </span>
            <div>
              <p className="text-sm font-medium text-white">{actor.name}</p>
              <p className="mt-0.5 text-xs text-slate-400">
                Pessoa fictícia · {actor.label}
              </p>
            </div>
          </div>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar menu de navegação"
          onClick={() => {
            setMenu(false);
            menuButton.current?.focus();
          }}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="flex min-w-0 items-center gap-3">
            <button
              ref={menuButton}
              type="button"
              className="icon-button lg:hidden"
              aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Icon name={menu ? 'close' : 'menu'} />
            </button>
            <span className="text-sm text-slate-500">HelpDesk</span>
            <span className="text-slate-300">/</span>
            <span className="truncate text-sm font-medium text-slate-700">
              {actor.label}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <ThemeToggle />
            <span
              className={`api-indicator ${health === 'available' ? 'text-teal-700' : 'text-amber-700'}`}
            >
              <span className="size-1.5 rounded-full bg-current" />
              {health === 'available'
                ? 'API disponível'
                : health === 'checking'
                  ? 'Verificando API'
                  : 'API indisponível'}
            </span>
          </div>
        </header>
        <SmoothWorkspace>
          <div className="demo-bar">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="demo-label">MODO DEMONSTRAÇÃO</span>
              <span className="text-xs leading-5 text-slate-600">
                Dados fictícios. Alterações só nesta sessão.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                Visualizar como
                <select
                  className="profile-select"
                  value={role}
                  onChange={(event) => {
                    setMenu(false);
                    window.location.hash = href(
                      event.target.value as Role,
                      'painel',
                    );
                  }}
                >
                  <option value="requester">Solicitante</option>
                  <option value="technician">Técnico</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
              <a className="text-button text-xs" href="#/login">
                Prévia de login
              </a>
              <button className="text-button text-xs" onClick={onReset}>
                Reiniciar prévia
              </button>
            </div>
          </div>
          <main
            id="main-content"
            tabIndex={-1}
            className="page-content"
            key={`${role}-${page}`}
          >
            {children}
          </main>
          <footer className="workspace-footer">
            <span>HelpDesk · VIS-004</span>
            <span>Seletor de perfil para avaliação · Sem autenticação</span>
          </footer>
        </SmoothWorkspace>
      </div>
      <BackToTop />
    </div>
  );
}
