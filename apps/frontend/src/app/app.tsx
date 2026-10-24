import { useEffect, useState } from 'react';

type ApiStatus = 'checking' | 'available' | 'unavailable';

export function App() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    fetch('/api/health', { signal: controller.signal })
      .then(async (response) => {
        const result: unknown = await response.json();
        if (
          !response.ok ||
          !result ||
          typeof result !== 'object' ||
          !('status' in result) ||
          result.status !== 'ok'
        ) {
          throw new Error('Resposta de integridade inválida.');
        }
        setApiStatus('available');
      })
      .catch(() => {
        if (active) setApiStatus('unavailable');
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const statusText = {
    checking: 'Verificando conexão com a API…',
    available: 'API local disponível',
    unavailable: 'API indisponível. Inicie o backend e recarregue a página.',
  }[apiStatus];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5 sm:px-10">
          <a
            href="/"
            className="flex items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
          >
            <span
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-xl bg-slate-900 font-bold text-white"
            >
              H
            </span>
            <span className="text-xl font-bold tracking-tight">
              HelpDesk<span className="text-teal-600">.</span>
            </span>
          </a>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
            {import.meta.env.DEV
              ? 'Ambiente de desenvolvimento'
              : 'Build de validação local'}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-14 sm:px-10 sm:py-20">
        <p className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-teal-700">
          Fundação técnica · M1
        </p>
        <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Um ponto de partida
          <br className="hidden sm:block" /> para um suporte melhor.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
          Este é o ambiente inicial do HelpDesk. A estrutura está sendo
          preparada para receber os próximos módulos, uma etapa de cada vez.
        </p>

        <section
          aria-labelledby="foundation-title"
          className="mt-12 grid gap-4 md:grid-cols-3"
        >
          <h2 id="foundation-title" className="sr-only">
            Tecnologias desta fundação
          </h2>
          {[
            [
              '01',
              'Interface',
              'React + TypeScript',
              'Uma base responsiva, com estilos em Tailwind CSS e desenvolvimento com Vite.',
            ],
            [
              '02',
              'API própria',
              'Express + Zod',
              'Uma API independente, com configuração validada e testes HTTP automatizados.',
            ],
            [
              '03',
              'Persistência',
              'PostgreSQL + Docker',
              'Infraestrutura local isolada. O estado do banco é verificado separadamente da API.',
            ],
          ].map(([number, title, technology, description]) => (
            <article
              key={number}
              className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7"
            >
              <span className="font-mono text-xs text-slate-400">{number}</span>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm font-medium text-teal-700">
                {technology}
              </p>
              <p className="mt-4 text-sm leading-6 text-slate-600">
                {description}
              </p>
            </article>
          ))}
        </section>

        <div
          className="mt-8 flex items-start gap-3 rounded-xl bg-slate-900 px-5 py-4 text-sm text-slate-200"
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden="true"
            className={`mt-1 size-2 shrink-0 rounded-full ${apiStatus === 'available' ? 'bg-teal-300' : 'bg-amber-300'}`}
          />
          <span>{statusText}</span>
        </div>
        <p className="mt-6 text-xs leading-6 text-slate-500">
          Esta tela valida a fundação tecnológica. Login, chamados e dashboards
          serão desenvolvidos em tarefas posteriores.
        </p>
      </main>
      <footer className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-6 pb-8 text-xs text-slate-500 sm:px-10">
        <span>HelpDesk · Desenvolvimento incremental</span>
        <span>Ambiente local · Acesso restrito ao computador</span>
      </footer>
    </div>
  );
}
