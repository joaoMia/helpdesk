import { useEffect, useRef, useState } from 'react';
import type { Role } from '../types/demo';
import type { LoginScenario } from '../mocks/login-demo';
import { loginScenarioError, validateDemoLogin } from '../mocks/login-demo';
import { focusFirstError } from '../lib/motion';
import { href } from '../navigation/routes';
import { ThemeToggle } from '../components/theme-toggle';
import { MotionRegion } from '../components/motion-region';
import { Icon } from '../components/ui';
import { useNotifications } from '../hooks/use-notifications';
export function Login() {
  const [identifier, setIdentifier] = useState(''),
    [show, setShow] = useState(false),
    [scenario, setScenario] = useState<LoginScenario>('success'),
    [role, setRole] = useState<Role>('requester');
  const [status, setStatus] = useState<
      'idle' | 'loading' | 'success' | 'error'
    >('idle'),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [feedback, setFeedback] = useState('');
  const secret = useRef<HTMLInputElement>(null),
    form = useRef<HTMLFormElement>(null),
    timer = useRef<number | undefined>(undefined),
    { notify } = useNotifications();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (Object.keys(errors).length) focusFirstError(form.current);
  }, [errors]);
  function submit() {
    if (status === 'loading') return;
    const problems = validateDemoLogin(
      identifier,
      !!secret.current?.value.trim(),
    );
    if (secret.current) secret.current.value = '';
    setErrors(problems);
    setFeedback('');
    if (Object.keys(problems).length) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    if (scenario === 'loading') return;
    timer.current = window.setTimeout(() => {
      const message = loginScenarioError(scenario);
      if (message) {
        setFeedback(message);
        setStatus('error');
        notify('error', message);
      } else {
        setStatus('success');
        setFeedback(
          'Entrada demonstrativa concluída. Nenhuma sessão, token ou autorização foi criada.',
        );
        notify(
          'success',
          'Prévia de entrada concluída, sem autenticação real.',
        );
      }
    }, 1100);
  }
  return (
    <div className="login-page">
      <header className="login-top">
        <a className="brand" href={href('requester', 'painel')}>
          <span className="brand-mark">
            <Icon name="ticket" />
          </span>
          HelpDesk<span className="brand-dot">.</span>
        </a>
        <div className="flex gap-2">
          <ThemeToggle />
        </div>
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
            Solicite apoio, acompanhe cada etapa e organize as iniciativas de
            tecnologia da sua equipe.
          </p>
          <div className="login-pillars">
            <span>
              <Icon name="ticket" /> Chamados organizados
            </span>
            <span>
              <Icon name="grid" /> Projetos em acompanhamento
            </span>
            <span>
              <Icon name="users" /> Três perfis, uma experiência
            </span>
          </div>
          <div className="login-security">
            <Icon name="check" />
            <p>
              Esta é uma prévia visual. Use exclusivamente dados fictícios.
              Nenhum dado de acesso será enviado ou salvo.
            </p>
          </div>
        </section>
        <MotionRegion motionKey="login-form" className="login-card">
          <span className="demo-label">LOGIN DEMONSTRATIVO</span>
          <h2>Bem-vindo ao HelpDesk</h2>
          <p className="text-sm leading-6 text-slate-500">
            Explore os estados da interface antes da autenticação real.
          </p>
          <form
            ref={form}
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="space-y-5 mt-7"
          >
            <label className="form-label">
              E-mail ou identificador
              <input
                className="field"
                name="demo-identifier"
                autoComplete="off"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                disabled={status === 'loading'}
                aria-invalid={!!errors.identifier}
                aria-describedby={
                  errors.identifier ? 'login-id-error' : undefined
                }
                placeholder="pessoa@example.invalid ou demo"
              />
            </label>
            {errors.identifier && (
              <p id="login-id-error" className="field-error">
                {errors.identifier}
              </p>
            )}
            <div>
              <label className="form-label" htmlFor="demo-secret">
                Senha fictícia
              </label>
              <div className="password-field">
                <input
                  ref={secret}
                  id="demo-secret"
                  className="field"
                  type={show ? 'text' : 'password'}
                  autoComplete="new-password"
                  disabled={status === 'loading'}
                  aria-invalid={!!errors.password}
                  aria-describedby="secret-help"
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
              <p
                id="secret-help"
                className="text-xs leading-5 text-slate-500 mt-2"
              >
                Não use sua senha real. O campo é limpo após cada tentativa;
                nada é armazenado.
              </p>
            </div>
            {errors.password && (
              <p className="field-error">{errors.password}</p>
            )}
            {feedback && (
              <p
                role={status === 'error' ? 'alert' : 'status'}
                className={status === 'error' ? 'form-error' : 'info-note'}
              >
                {feedback}
              </p>
            )}
            <button
              type="submit"
              className="button-primary w-full justify-center"
              disabled={status === 'loading'}
              aria-busy={status === 'loading'}
            >
              {status === 'loading' ? (
                <>
                  <span className="loading-spinner" /> Envio demonstrativo em
                  andamento…
                </>
              ) : (
                <>
                  Simular entrada <Icon name="arrow" />
                </>
              )}
            </button>
            {status === 'loading' && scenario === 'loading' && (
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setStatus('idle');
                  notify(
                    'info',
                    'Estado de carregamento encerrado. Nenhum pedido foi enviado.',
                  );
                }}
              >
                Encerrar teste de carregamento
              </button>
            )}
            {status === 'success' && (
              <a
                className="button-secondary w-full justify-center"
                href={href(role, 'painel')}
              >
                Explorar perfil demonstrativo <Icon name="arrow" />
              </a>
            )}
            <fieldset className="login-lab" disabled={status === 'loading'}>
              <legend>Laboratório de estados · sem autenticação</legend>
              <label className="form-label">
                Cenário de resposta
                <select
                  className="field"
                  value={scenario}
                  onChange={(e) => {
                    setScenario(e.target.value as LoginScenario);
                    setStatus('idle');
                    setFeedback('');
                  }}
                >
                  <option value="success">
                    Entrada demonstrativa bem-sucedida
                  </option>
                  <option value="incorrect">
                    Credenciais incorretas · simulação
                  </option>
                  <option value="not-found">
                    Conta não encontrada · simulação
                  </option>
                  <option value="loading">
                    Manter estado de envio em andamento
                  </option>
                </select>
              </label>
              <label className="form-label">
                Perfil para explorar após a demonstração
                <select
                  className="field"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                >
                  <option value="requester">Solicitante</option>
                  <option value="technician">Técnico</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
              <p>
                Os erros específicos existem somente neste laboratório. Na API
                real, a resposta de credenciais será genérica para evitar
                enumeração de contas. Selecionar perfil não concede permissão.
              </p>
            </fieldset>
          </form>
          <a
            className="text-button mt-6 text-sm"
            href={href('requester', 'painel')}
          >
            Continuar explorando a prévia
          </a>
        </MotionRegion>
      </main>
    </div>
  );
}
