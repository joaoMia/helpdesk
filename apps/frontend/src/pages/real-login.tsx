import { useRef, useState } from 'react';
import type { PublicUser } from '@helpdesk/contracts';
import { loginSchema, registerSchema } from '@helpdesk/contracts';
import { ThemeToggle } from '../components/theme-toggle';
import { Icon } from '../components/ui';
import { AuthError, authClient } from '../lib/auth-client';

export function RealLogin({
  register = false,
  onLogin,
  onRegistered,
  message = '',
  notice = '',
}: {
  register?: boolean;
  onLogin: (user: PublicUser) => void;
  onRegistered: () => void;
  message?: string;
  notice?: string;
}) {
  const [busy, setBusy] = useState(false),
    [show, setShow] = useState(false),
    [error, setError] = useState('');
  const form = useRef<HTMLFormElement>(null);
  async function submit() {
    if (busy || !form.current) return;
    const data = new FormData(form.current);
    const payload = {
      email: String(data.get('email') ?? ''),
      password: String(data.get('password') ?? ''),
      ...(register ? { name: String(data.get('name') ?? '') } : {}),
    };
    const parsed = (register ? registerSchema : loginSchema).safeParse(payload);
    setError('');
    if (!parsed.success) {
      setError(
        register
          ? 'Informe nome, e-mail válido e senha de 12 a 128 caracteres.'
          : 'Informe e-mail válido e senha.',
      );
      form.current.querySelector<HTMLInputElement>('input')?.focus();
      return;
    }
    setBusy(true);
    try {
      if (register) {
        await authClient.register(
          parsed.data as { name: string; email: string; password: string },
        );
        form.current.reset();
        onRegistered();
      } else {
        const user = await authClient.login(parsed.data);
        form.current.reset();
        onLogin(user);
      }
    } catch (e) {
      setError(
        e instanceof AuthError
          ? e.message
          : 'Não foi possível conectar à API. Tente novamente em instantes.',
      );
    } finally {
      setBusy(false);
      if (form.current) {
        const field = form.current.elements.namedItem(
          'password',
        ) as HTMLInputElement | null;
        if (field) field.value = '';
      }
    }
  }
  return (
    <div className="login-page">
      <header className="login-top">
        <a className="brand" href="#/login">
          <span className="brand-mark">
            <Icon name="ticket" />
          </span>
          HelpDesk<span className="brand-dot">.</span>
        </a>
        <ThemeToggle />
      </header>
      <main className="login-grid">
        <section className="login-story">
          <span className="eyebrow">TECNOLOGIA QUE APOIA SUA ROTINA</span>
          <h1 id="page-title" tabIndex={-1}>
            O suporte certo.
            <br />
            <span>Um caminho mais simples.</span>
          </h1>
          <p>
            Sua conta, protegida. Entre para acessar a área autenticada do
            HelpDesk.
          </p>
          <div className="login-security">
            <Icon name="check" />
            <p>
              Autenticação real na API e PostgreSQL. O laboratório visual
              continua separado dos módulos funcionais.
            </p>
          </div>
        </section>
        <section className="login-card">
          <span className="eyebrow">
            {register ? 'CADASTRO DE SOLICITANTE' : 'ACESSO AO HELPDESK'}
          </span>
          <h2>{register ? 'Criar sua conta' : 'Bem-vindo ao HelpDesk'}</h2>
          <form
            ref={form}
            className="space-y-5 mt-7"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            {register && (
              <label className="form-label">
                Nome completo
                <input
                  className="field"
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
                  disabled={busy}
                />
              </label>
            )}
            <label className="form-label">
              E-mail
              <input
                className="field"
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                disabled={busy}
              />
            </label>
            <div>
              <label className="form-label" htmlFor="real-password">
                Senha
              </label>
              <div className="password-field">
                <input
                  id="real-password"
                  className="field"
                  name="password"
                  type={show ? 'text' : 'password'}
                  autoComplete={register ? 'new-password' : 'current-password'}
                  required
                  maxLength={256}
                  disabled={busy}
                  aria-describedby="password-policy"
                />
                <button
                  type="button"
                  className="text-button"
                  aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={show}
                  onClick={() => setShow(!show)}
                >
                  {show ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <p id="password-policy" className="text-xs text-slate-500 mt-2">
                {register
                  ? 'Use de 12 a 128 caracteres. Nenhum perfil administrativo pode ser escolhido no cadastro.'
                  : 'Credenciais inválidas e contas indisponíveis recebem uma mensagem genérica.'}
              </p>
            </div>
            {(error || message) && (
              <p role="alert" className="form-error">
                {error || message}
              </p>
            )}
            {notice && (
              <p role="status" className="info-note">
                {notice}
              </p>
            )}
            <button
              type="submit"
              className="button-primary w-full justify-center"
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? 'Aguarde…' : register ? 'Criar conta' : 'Entrar'}
            </button>
            {register && (
              <p className="text-xs leading-5 text-slate-500">
                O ambiente local ainda não verifica o e-mail por envio de
                mensagem. Esse serviço deverá ser homologado antes da
                implantação corporativa.
              </p>
            )}
          </form>
          <a
            className="text-button mt-5"
            href={register ? '#/login' : '#/register'}
          >
            {register
              ? 'Já tenho conta · entrar'
              : 'Sou solicitante · criar conta'}
          </a>
          <p className="mt-5 text-xs text-slate-500">
            Recuperação de acesso por e-mail ainda não está disponível.
          </p>
          <a className="text-button mt-5" href="#/demo/requester/painel">
            Explorar laboratório visual · sem autenticação
          </a>
        </section>
      </main>
    </div>
  );
}
