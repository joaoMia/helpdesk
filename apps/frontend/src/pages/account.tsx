import type { PublicUser } from '@helpdesk/contracts';
import { useState } from 'react';
import { ThemeToggle } from '../components/theme-toggle';
import { useApiHealth } from '../hooks/use-api-health';
import { Icon, PageHeading } from '../components/ui';
import { authenticatedHome, profileAreas } from '../navigation/auth-routes';
export function Account({
  user,
  logout,
  busy,
  error,
}: {
  user: PublicUser;
  logout: () => void;
  busy: boolean;
  error: string;
}) {
  const health = useApiHealth();
  const [menu, setMenu] = useState(false);
  const area = profileAreas[user.role];
  const modules =
    user.role === 'REQUESTER'
      ? ['Abrir chamado', 'Meus chamados', 'Meus projetos']
      : user.role === 'TECHNICIAN'
        ? ['Fila de chamados', 'Meus atendimentos']
        : ['Gestão de usuários', 'Catálogo de serviços'];
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
        className={`sidebar ${menu ? 'sidebar-open' : ''}`}
        aria-label="Navegação da área autenticada"
        onKeyDown={(event) => {
          if (event.key === 'Escape') setMenu(false);
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
            className="nav-item nav-active"
            aria-current="page"
            href={authenticatedHome(user)}
            onClick={() => setMenu(false)}
          >
            <Icon name="grid" />
            Início
          </a>
          <a className="nav-item" href="#/change-password">
            <Icon name="users" />
            Alterar senha
          </a>
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
          onClick={() => setMenu(false)}
        />
      )}
      <div className="workspace">
        <header className="topbar">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="icon-button lg:hidden"
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
        <div className="workspace-body flex flex-col">
          <main
            id="authenticated-content"
            tabIndex={-1}
            className="page-content space-y-6"
          >
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
            <section
              className="info-note"
              aria-label="Disponibilidade dos módulos"
            >
              Os módulos de chamados e projetos estão em desenvolvimento. Nenhum
              chamado, projeto ou indicador fictício é apresentado como dado da
              sua conta.
            </section>
            <div className="grid gap-4 md:grid-cols-3">
              {modules.map((name) => (
                <section key={name} className="panel p-5">
                  <h2 className="font-semibold">{name}</h2>
                  <p className="mt-3 text-sm text-slate-500">
                    Em desenvolvimento
                  </p>
                  <button
                    className="button-secondary mt-4"
                    disabled
                    aria-label={`${name} — em desenvolvimento`}
                  >
                    Indisponível nesta etapa
                  </button>
                </section>
              ))}
            </div>
            <section className="panel p-5 space-y-3">
              <h2 className="font-semibold">Laboratório visual separado</h2>
              <p className="text-sm text-slate-500">
                A prévia usa somente dados fictícios e operações em memória. O
                seletor de perfis do laboratório não concede acesso real.
              </p>
              <a className="text-button" href="#/demo/requester/painel">
                Explorar demonstração · dados fictícios
              </a>
            </section>
            <p className="text-xs text-slate-500" role="status">
              {health === 'available'
                ? 'API disponível'
                : health === 'checking'
                  ? 'Verificando API…'
                  : 'API indisponível'}
            </p>
          </main>
          <footer className="workspace-footer">
            HelpDesk · Área autenticada · {area.label}
          </footer>
        </div>
      </div>
    </div>
  );
}
