import { useEffect, useState } from 'react';
import type { PublicUser } from '@helpdesk/contracts';
import { updateProfileSchema } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
export function Profile({
  onUpdated,
  onExpired,
}: {
  onUpdated: (user: PublicUser, reauthenticate: boolean) => void;
  onExpired: () => void;
}) {
  const [user, setUser] = useState<PublicUser | null>(null),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    authClient
      .profile()
      .then((value) => {
        if (active) {
          setUser(value);
          setName(value.name);
          setEmail(value.email);
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else setError('Não foi possível carregar o perfil. Tente novamente.');
        }
      });
    return () => {
      active = false;
    };
  }, [onExpired]);
  const emailChanged = !!user && email.trim().toLowerCase() !== user.email;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user || busy) return;
    setError('');
    setSuccess('');
    const input = {
      name,
      email,
      ...(emailChanged ? { currentPassword: password } : {}),
    };
    if (
      !updateProfileSchema.safeParse(input).success ||
      (emailChanged && !password)
    ) {
      setError(
        'Informe nome completo, e-mail válido e a senha atual ao alterar o e-mail.',
      );
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.updateProfile(input);
      setPassword('');
      setUser(result.user);
      setName(result.user.name);
      setEmail(result.user.email);
      setSuccess('Perfil atualizado.');
      onUpdated(result.user, result.reauthenticate);
    } catch (e) {
      setPassword('');
      if (e instanceof AuthError && e.status === 401) onExpired();
      else
        setError(
          e instanceof Error
            ? e.message
            : 'Não foi possível salvar. Tente novamente.',
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel p-6 space-y-5">
      <h1 className="text-xl font-semibold">Meu perfil</h1>
      <p className="text-sm text-slate-500">
        Dados reais da sua conta de solicitante.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {success && <p role="status">{success}</p>}
      {!user ? (
        <p role="status">
          {error
            ? 'Recarregue a página para tentar novamente.'
            : 'Carregando perfil…'}
        </p>
      ) : (
        <form
          onSubmit={(event) => void save(event)}
          className="space-y-5 max-w-xl"
        >
          <p>Perfil: Solicitante</p>
          <label className="block space-y-2">
            <span>Nome completo</span>
            <input
              className="field w-full"
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>
          <label className="block space-y-2">
            <span>E-mail</span>
            <input
              className="field w-full"
              type="email"
              required
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          {emailChanged && (
            <>
              <label className="block space-y-2">
                <span>Senha atual para confirmar o novo e-mail</span>
                <input
                  className="field w-full"
                  type="password"
                  required
                  maxLength={256}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </label>
              <p className="info-note">
                Alterar o e-mail encerrará todas as sessões. Entre novamente com
                o novo endereço. Ainda não há verificação de propriedade por
                e-mail.
              </p>
            </>
          )}
          <button className="button-primary" disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar alterações'}
          </button>
          <a className="text-button ml-4" href="#/change-password">
            Alterar senha
          </a>
        </form>
      )}
    </section>
  );
}
