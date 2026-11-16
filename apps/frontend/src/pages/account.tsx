import type { PublicUser } from '@helpdesk/contracts';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ThemeToggle } from '../components/theme-toggle';
import { SmoothWorkspace } from '../components/smooth-workspace';
import { useApiHealth } from '../hooks/use-api-health';
import { Icon, PageHeading } from '../components/ui';
import { authenticatedHome, profileAreas } from '../navigation/auth-routes';
export function Account({
  user,
  logout,
  busy,
  error,
  children,
}: {
  user: PublicUser;
  logout: () => void;
  busy: boolean;
  error: string;
  children?: ReactNode;
}) {
  const health = useApiHealth();
  const [menu, setMenu] = useState(false);
  const sidebar = useRef<HTMLElement>(null),
    menuButton = useRef<HTMLButtonElement>(null);
  const wasMenuOpen = useRef(false);
  useEffect(() => {
    if (menu)
      sidebar.current
        ?.querySelector<HTMLElement>('a[href],button:not(:disabled)')
        ?.focus();
    else if (wasMenuOpen.current) menuButton.current?.focus();
    wasMenuOpen.current = menu;
  }, [menu]);
  const area = profileAreas[user.role];
  const currentPath = window.location.hash;
  const projectPath =
    '#/' +
    (user.role === 'ADMIN'
      ? 'admin'
      : user.role === 'TECHNICIAN'
        ? 'technician'
        : 'requester') +
    '/projetos';
  const projectActive =
    currentPath === projectPath || currentPath.startsWith(projectPath + '/');
  const catalogPath = '#/admin/catalogo';
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#authenticated-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('authenticated-content')?.focus();
        }}
      >
        Ir para o conteúdo
      </a>
      <aside
        ref={sidebar}
        id="primary-navigation"
        className={`sidebar ${menu ? 'sidebar-open' : ''}`}
        aria-label="Navegação da área autenticada"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setMenu(false);
            menuButton.current?.focus();
          } else if (event.key === 'Tab') {
            const items = sidebar.current?.querySelectorAll<HTMLElement>(
              'a[href],button:not(:disabled)',
            );
            if (!items?.length) return;
            const first = items[0]!,
              last = items[items.length - 1]!;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              menuButton.current?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <a className="brand" href={authenticatedHome(user)}>
          <span className="brand-mark">
            <Icon name="ticket" />
          </span>
          HelpDesk<span className="brand-dot">.</span>
        </a>
        <p className="nav-caption">ESPAÇO DE TRABALHO</p>
        <div className="workspace-label">{area.label}</div>
        <nav className="mt-6">
          <a
            className={`nav-item ${currentPath === authenticatedHome(user) ? 'nav-active' : ''}`}
            aria-current={
              currentPath === authenticatedHome(user) ? 'page' : undefined
            }
            href={authenticatedHome(user)}
            onClick={() => setMenu(false)}
          >
            <Icon name="grid" />
            Início
          </a>
          {
            <a
              className={`nav-item ${currentPath.endsWith('/perfil') ? 'nav-active' : ''}`}
              aria-current={
                currentPath.endsWith('/perfil') ? 'page' : undefined
              }
              href={
                user.role === 'TECHNICIAN'
                  ? '#/technician/perfil'
                  : user.role === 'ADMIN'
                    ? '#/admin/perfil'
                    : '#/requester/perfil'
              }
              onClick={() => setMenu(false)}
            >
              <Icon name="users" />
              Meu perfil
            </a>
          }
          {user.role === 'REQUESTER' && (
            <>
              <a
                className={`nav-item ${currentPath === '#/requester/novo' ? 'nav-active' : ''}`}
                aria-current={
                  currentPath === '#/requester/novo' ? 'page' : undefined
                }
                href="#/requester/novo"
                onClick={() => setMenu(false)}
              >
                <Icon name="plus" />
                Abrir chamado
              </a>
              <a
                className={`nav-item ${currentPath === '#/requester/chamados' || currentPath.startsWith('#/requester/chamado/') ? 'nav-active' : ''}`}
                aria-current={
                  currentPath === '#/requester/chamados' ||
                  currentPath.startsWith('#/requester/chamado/')
                    ? 'page'
                    : undefined
                }
                href="#/requester/chamados"
                onClick={() => setMenu(false)}
              >
                <Icon name="ticket" />
                Meus chamados
              </a>
            </>
          )}
          {['ADMIN', 'TECHNICIAN', 'REQUESTER'].includes(user.role) && (
            <a
              className={`nav-item ${projectActive ? 'nav-active' : ''}`}
              aria-current={projectActive ? 'page' : undefined}
              href={projectPath}
              onClick={() => setMenu(false)}
            >
              <Icon name="grid" />
              Projetos
            </a>
          )}
          {user.role === 'ADMIN' && (
            <a
              className={`nav-item ${currentPath.startsWith('#/admin/usuarios') ? 'nav-active' : ''}`}
              aria-current={
                currentPath.startsWith('#/admin/usuarios') ? 'page' : undefined
              }
              href="#/admin/usuarios"
              onClick={() => setMenu(false)}
            >
              <Icon name="users" />
              Central Administrativa
            </a>
          )}
          {['TECHNICIAN', 'ADMIN'].includes(user.role) && (
            <a
              className={`nav-item ${currentPath.startsWith('#/technician/chamados') || currentPath === '#/admin/chamados' ? 'nav-active' : ''}`}
              aria-current={
                currentPath.startsWith('#/technician/chamados') ||
                currentPath === '#/admin/chamados'
                  ? 'page'
                  : undefined
              }
              href={
                user.role === 'ADMIN'
                  ? '#/admin/chamados'
                  : '#/technician/chamados/nao-classificados'
              }
              onClick={() => setMenu(false)}
            >
              <Icon name="ticket" />
              Chamados
            </a>
          )}
          {user.role === 'TECHNICIAN' && (
            <a
              className={`nav-item ${currentPath === '#/technician/atendimentos' || currentPath.startsWith('#/technician/chamado/') ? 'nav-active' : ''}`}
              aria-current={
                currentPath === '#/technician/atendimentos' ||
                currentPath.startsWith('#/technician/chamado/')
                  ? 'page'
                  : undefined
              }
              href="#/technician/atendimentos"
              onClick={() => setMenu(false)}
            >
              <Icon name="tool" />
              Meus atendimentos
            </a>
          )}
          {user.role === 'ADMIN' && (
            <a
              className={`nav-item ${currentPath === catalogPath ? 'nav-active' : ''}`}
              aria-current={currentPath === catalogPath ? 'page' : undefined}
              href={catalogPath}
              onClick={() => setMenu(false)}
            >
              <Icon name="grid" />
              Catálogo de serviços
            </a>
          )}
        </nav>
        <div className="sidebar-bottom">
          <p className="text-sm font-medium text-white break-words">
            {user.name}
          </p>
          <p className="mt-1 text-xs text-slate-400 break-all">{user.email}</p>
          <p className="mt-2 text-xs text-slate-400">
            Perfil autenticado · {area.label}
          </p>
        </div>
      </aside>
      {menu && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar menu"
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
              className="icon-button lg:hidden"
              ref={menuButton}
              aria-controls="primary-navigation"
              aria-label={menu ? 'Fechar menu' : 'Abrir menu'}
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            >
              <Icon name={menu ? 'close' : 'menu'} />
            </button>
            <span className="truncate text-sm font-medium">
              HelpDesk / {area.label}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              className="button-secondary"
              disabled={busy}
              onClick={logout}
            >
              {busy ? 'Saindo…' : 'Sair'}
            </button>
          </div>
        </header>
        <SmoothWorkspace enabled={!currentPath.includes('/chamado/')}>
          <main
            id="authenticated-content"
            tabIndex={-1}
            className="page-content space-y-6"
          >
            {children ?? (
              <>
                <PageHeading
                  eyebrow={`ÁREA DO ${area.label.toUpperCase()}`}
                  title={`Bem-vindo, ${user.name}`}
                  description="Este é o seu início no HelpDesk. Sua conta e sessão são reais."
                />
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                <a className="button-primary" href={authenticatedHome(user)}>
                  Abrir painel
                </a>
                <p className="text-xs text-slate-500" role="status">
                  {health === 'available'
                    ? 'API disponível'
                    : health === 'checking'
                      ? 'Verificando API…'
                      : 'API indisponível'}
                </p>
              </>
            )}
          </main>
          <footer className="workspace-footer">
            HelpDesk · Área autenticada · {area.label}
          </footer>
        </SmoothWorkspace>
      </div>
    </div>
  );
}
