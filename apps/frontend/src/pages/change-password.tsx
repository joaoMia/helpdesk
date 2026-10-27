import { useRef, useState } from 'react';
import { changePasswordSchema } from '@helpdesk/contracts';
import { AuthError, authClient } from '../lib/auth-client';
import { ThemeToggle } from '../components/theme-toggle';
export function ChangePassword({
  required,
  onChanged,
  onLogout,
  onSessionExpired,
  externalError = '',
}: {
  required: boolean;
  onChanged: () => void;
  onLogout: () => void;
  onSessionExpired: () => void;
  externalError?: string;
}) {
  const form = useRef<HTMLFormElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit() {
    if (!form.current || busy) return;
    const data = new FormData(form.current),
      parsed = changePasswordSchema.safeParse({
        currentPassword: data.get('currentPassword'),
        newPassword: data.get('newPassword'),
      });
    if (!parsed.success) {
      setError(
        'Informe a senha atual e uma nova senha de 12 a 128 caracteres.',
      );
      return;
    }
    if (parsed.data.newPassword !== data.get('confirmPassword')) {
      setError('A confirmação da nova senha não corresponde.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authClient.changePassword(parsed.data);
      form.current.reset();
      onChanged();
    } catch (e) {
      if (e instanceof AuthError && e.code === 'SESSION_INVALID') {
        onSessionExpired();
        return;
      }
      setError(
        e instanceof Error ? e.message : 'Não foi possível alterar a senha.',
      );
    } finally {
      setBusy(false);
      form.current?.reset();
    }
  }
  return (
    <div className="login-page">
      <header className="login-top">
        <a className="brand" href="#/account">
          HelpDesk.
        </a>
        <ThemeToggle />
      </header>
      <main className="max-w-xl mx-auto p-6">
        <section className="login-card">
          <h1 id="page-title" className="page-title" tabIndex={-1}>
            {required ? 'Troque sua senha inicial' : 'Alterar senha'}
          </h1>
          <p className="info-note mt-4">
            {required
              ? 'A troca é obrigatória antes de acessar funcionalidades comuns. '
              : ' '}
            A senha atual é obrigatória. Após a troca, todas as sessões serão
            encerradas; entre novamente.
          </p>
          <form
            ref={form}
            className="space-y-5 mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="form-label">
              Senha atual
              <input
                className="field"
                type="password"
                name="currentPassword"
                autoComplete="current-password"
                required
                maxLength={256}
                disabled={busy}
              />
            </label>
            <label className="form-label">
              Nova senha
              <input
                className="field"
                type="password"
                name="newPassword"
                autoComplete="new-password"
                required
                maxLength={256}
                disabled={busy}
              />
            </label>
            <label className="form-label">
              Confirmar nova senha
              <input
                className="field"
                type="password"
                name="confirmPassword"
                autoComplete="new-password"
                required
                maxLength={256}
                disabled={busy}
              />
            </label>
            {(error || externalError) && (
              <p role="alert" className="form-error">
                {error || externalError}
              </p>
            )}
            <button className="button-primary" disabled={busy} aria-busy={busy}>
              {busy ? 'Alterando…' : 'Alterar senha e encerrar sessões'}
            </button>
          </form>
          <div className="flex gap-4 mt-5">
            {!required && (
              <a className="text-button" href="#/account">
                Voltar à conta
              </a>
            )}
            <button className="text-button" disabled={busy} onClick={onLogout}>
              Sair
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
