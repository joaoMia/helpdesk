import { useEffect, useRef, useState } from 'react';
import type { PublicUser } from '@helpdesk/contracts';
import { App as DemoApp } from './app';
import { RealLogin } from '../pages/real-login';
import { Account } from '../pages/account';
import { ChangePassword } from '../pages/change-password';
import { AuthError, authClient } from '../lib/auth-client';
import { authDestination, authenticatedHome } from '../navigation/auth-routes';

export function AuthEntry() {
  const [path, setPath] = useState(window.location.hash),
    [user, setUser] = useState<PublicUser | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [message, setMessage] = useState('');
  const epoch = useRef(0);
  useEffect(() => {
    const change = () => {
      const next = window.location.hash;
      if (path.startsWith('#/demo/') && !next.startsWith('#/demo/'))
        setLoading(true);
      setPath(next);
    };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, [path]);
  const demo = path.startsWith('#/demo/');
  useEffect(() => {
    if (demo) return;
    let active = true;
    const current = epoch.current;
    authClient
      .me()
      .then((value) => {
        if (active && current === epoch.current) {
          setUser(value);
          setMessage('');
        }
      })
      .catch((error) => {
        if (active && current === epoch.current) {
          setUser(null);
          if (!(error instanceof AuthError && error.status === 401))
            setMessage(
              'Não foi possível consultar a sessão. Confira a API e tente novamente.',
            );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [demo]);
  useEffect(() => {
    if (demo || loading) return;
    document.title = user ? 'HelpDesk · Início' : 'HelpDesk · Acesso seguro';
    const destination = authDestination(user, path);
    if (path !== destination) window.location.replace(destination);
  }, [demo, loading, user, path]);
  useEffect(() => {
    if (!user || demo) return;
    let active = true;
    const check = () => {
      const current = epoch.current;
      if (document.visibilityState === 'visible')
        void authClient
          .me()
          .then((value) => {
            if (active && current === epoch.current) {
              setUser(value);
              setMessage('');
            }
          })
          .catch((error) => {
            if (!active || current !== epoch.current) return;
            if (!(error instanceof AuthError && error.status === 401)) {
              setMessage(
                'Não foi possível verificar a sessão. A API será consultada novamente.',
              );
              return;
            }
            setUser(null);
            setMessage(
              'Sessão expirada ou conta indisponível. Entre novamente.',
            );
            window.location.hash = '#/login';
          });
    };
    document.addEventListener('visibilitychange', check);
    const interval = window.setInterval(check, 60000);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(interval);
    };
  }, [user, demo]);
  async function logout() {
    if (busy) return;
    epoch.current++;
    setBusy(true);
    setMessage('');
    try {
      await authClient.logout();
      epoch.current++;
      setUser(null);
      window.location.hash = '#/login';
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : 'Não foi possível sair. Tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (demo) return <DemoApp />;
  if (loading)
    return (
      <main className="p-10" role="status">
        Consultando sessão segura…
      </main>
    );
  if (user && (user.mustChangePassword || path === '#/change-password'))
    return (
      <ChangePassword
        externalError={message}
        required={user.mustChangePassword}
        onSessionExpired={() => {
          epoch.current++;
          setUser(null);
          setMessage('Sessão expirada. Entre novamente para alterar a senha.');
          window.location.hash = '#/login';
        }}
        onLogout={() => {
          void logout();
        }}
        onChanged={() => {
          epoch.current++;
          setUser(null);
          setMessage(
            'Senha alterada e sessões encerradas. Entre com a nova senha.',
          );
          window.location.hash = '#/login';
        }}
      />
    );
  if (user)
    return (
      <Account
        user={user}
        logout={() => {
          void logout();
        }}
        busy={busy}
        error={message}
      />
    );
  return (
    <RealLogin
      key={path}
      register={path === '#/register'}
      message={message}
      notice={notice}
      onRegistered={() => {
        setMessage('');
        setNotice('Conta de solicitante criada. Entre com seu e-mail e senha.');
        window.location.hash = '#/login';
      }}
      onLogin={(value) => {
        epoch.current++;
        setUser(value);
        setMessage('');
        setNotice('');
        window.location.hash = value.mustChangePassword
          ? '#/change-password'
          : authenticatedHome(value);
      }}
    />
  );
}
