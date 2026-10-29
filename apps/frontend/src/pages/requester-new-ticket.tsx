import { useEffect, useRef, useState } from 'react';
import type { Category, CatalogService } from '@helpdesk/contracts';
import { createTicketHttpSchema } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { PageHeading, Icon, EmptyState, Panel } from '../components/ui';
import { Stepper } from '../components/stepper';
import { MotionRegion } from '../components/motion-region';
import { ConfirmChange } from '../components/confirm-change';
import { focusFirstError, scrollToContent } from '../lib/motion';
export function RequesterNewTicket({
  onExpired,
  onCreated,
}: {
  onExpired: () => void;
  onCreated: (id: string) => void;
}) {
  const [step, setStep] = useState(0),
    [category, setCategory] = useState<Category | null>(null),
    [service, setService] = useState<CatalogService | null>(null),
    [categories, setCategories] = useState<Category[]>([]),
    [services, setServices] = useState<CatalogService[]>([]),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState(''),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [subject, setSubject] = useState(''),
    [description, setDescription] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [revision, setRevision] = useState(0),
    [change, setChange] = useState<(() => void) | null>(null);
  const submitting = useRef(false),
    alive = useRef(true),
    root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    document.getElementById('page-title')?.focus({ preventScroll: true });
    scrollToContent(root.current);
  }, [step]);
  useEffect(() => {
    if (step > 1) return;
    let active = true;
    const request =
      step === 0
        ? authClient.categories({ page, pageSize: 12, search: filter })
        : authClient.services({
            page,
            pageSize: 12,
            search: filter,
            categoryId: category?.id,
          });
    request
      .then((result) => {
        if (active) {
          if (step === 0) setCategories(result.items as Category[]);
          else setServices(result.items as CatalogService[]);
          setTotal(result.total);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else
            setError(
              'Não foi possível carregar o catálogo. Atualize e tente novamente.',
            );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [step, page, filter, category?.id, revision, onExpired]);
  function go(next: number) {
    if (submitting.current) return;
    setStep(next);
    setPage(1);
    setQuery('');
    setFilter('');
    setLoading(true);
    setError('');
  }
  function select(next: () => void, changed: boolean) {
    if (submitting.current) return;
    if (changed && (subject || description)) setChange(() => next);
    else next();
  }
  function chooseCategory(c: Category) {
    select(() => {
      if (c.id !== category?.id) {
        setService(null);
        setSubject('');
        setDescription('');
      }
      setCategory(c);
      go(1);
    }, c.id !== category?.id);
  }
  function chooseService(s: CatalogService) {
    select(() => {
      if (s.id !== service?.id) {
        setSubject('');
        setDescription('');
      }
      setService(s);
      go(2);
    }, s.id !== service?.id);
  }
  function review(e: React.FormEvent) {
    e.preventDefault();
    const input = createTicketHttpSchema.safeParse({
      serviceId: service?.id,
      subject,
      description,
      answers: {},
    });
    if (!input.success) {
      setError('Preencha assunto e descrição e selecione um serviço válido.');
      window.requestAnimationFrame(() => focusFirstError(root.current));
      return;
    }
    setError('');
    go(3);
  }
  async function open() {
    if (submitting.current || uncertain || !service) return;
    const parsed = createTicketHttpSchema.safeParse({
      serviceId: service.id,
      subject,
      description,
      answers: {},
    });
    if (!parsed.success) {
      setError('Revise o formulário antes de abrir.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const created = await authClient.createTicket(parsed.data);
      if (alive.current) onCreated(created.id);
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof AuthError && e.status === 401) {
        onExpired();
        return;
      }
      const ambiguous =
        !(e instanceof AuthError) ||
        e.status === 0 ||
        e.status >= 500 ||
        e.code === 'INVALID_RESPONSE';
      setUncertain(ambiguous);
      setError(
        ambiguous
          ? 'Não foi possível confirmar o resultado. Consulte Meus chamados antes de tentar uma nova abertura.'
          : e instanceof AuthError
            ? e.message
            : 'Não foi possível abrir o chamado.',
      );
      if (!ambiguous) submitting.current = false;
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <div ref={root}>
      {change && (
        <ConfirmChange
          demonstration={false}
          message="Trocar a seleção descarta o assunto e a descrição preenchidos. Deseja manter o rascunho?"
          onCancel={() => setChange(null)}
          onConfirm={() => {
            change();
            setChange(null);
          }}
        />
      )}
      <PageHeading
        eyebrow="CENTRAL DE SERVIÇOS"
        title={
          [
            'Do que você precisa?',
            'Escolha o serviço',
            'Conte os detalhes',
            'Revise e abra seu chamado',
          ][step]!
        }
        description={
          step === 0
            ? 'Encontre a categoria certa. Um chamado, um serviço, um acompanhamento completo.'
            : step === 1
              ? `${category?.name ?? 'Categoria'} · escolha exatamente um serviço ativo.`
              : step === 2
                ? 'Descreva sua necessidade. Seu chamado será registrado com segurança.'
                : 'Confira os dados antes de registrar a solicitação.'
        }
      />
      <Stepper
        steps={['Categoria', 'Serviço', 'Formulário', 'Revisão']}
        current={step}
        onStep={(next) => {
          if (!busy && !uncertain) go(next);
        }}
      />
      {error && (
        <p role="alert" className="form-error mb-5">
          {error}
        </p>
      )}
      <MotionRegion motionKey={'real-ticket-step-' + step}>
        {step < 2 ? (
          <>
            {step === 1 && (
              <p className="info-note mb-5">
                Categoria: {category?.name}. Precisa de dois serviços? Abra dois
                chamados distintos.
              </p>
            )}
            <form
              className="flex flex-wrap gap-3 mb-6"
              onSubmit={(e) => {
                e.preventDefault();
                setFilter(query.trim());
                setPage(1);
                setLoading(true);
                setRevision((n) => n + 1);
              }}
            >
              <label className="search-field flex-1">
                <Icon name="search" />
                <span className="sr-only">
                  {step === 0 ? 'Buscar categoria' : 'Buscar serviço'}
                </span>
                <input
                  value={query}
                  maxLength={120}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    step === 0
                      ? 'Buscar categoria de serviço'
                      : 'Buscar serviço'
                  }
                />
              </label>
              <button className="button-secondary">Buscar</button>
            </form>
            {loading ? (
              <p role="status" className="panel p-6">
                Carregando catálogo…
              </p>
            ) : (
              <>
                <div className="selection-grid">
                  {step === 0
                    ? categories.map((c) => (
                        <button
                          className="selection-card"
                          key={c.id}
                          onClick={() => chooseCategory(c)}
                        >
                          <span className="category-symbol">
                            <Icon name="tool" />
                          </span>
                          <h2>{c.name}</h2>
                          <p>{c.description}</p>
                          <span className="selection-meta">
                            Ver serviços <Icon name="arrow" />
                          </span>
                        </button>
                      ))
                    : services.map((s) => (
                        <button
                          key={s.id}
                          className={`selection-card ${s.id === service?.id ? 'selection-current' : ''}`}
                          onClick={() => chooseService(s)}
                        >
                          <span className="category-symbol">
                            <Icon name="ticket" />
                          </span>
                          <h2>{s.name}</h2>
                          <p>{s.description}</p>
                          <span className="selection-meta">
                            Preencher solicitação <Icon name="arrow" />
                          </span>
                        </button>
                      ))}
                </div>
                {!(step === 0 ? categories.length : services.length) && (
                  <EmptyState
                    title={
                      step === 0
                        ? 'Nenhuma categoria encontrada'
                        : 'Nenhum serviço ativo nesta categoria'
                    }
                  >
                    Experimente outra pesquisa ou escolha outra categoria.
                  </EmptyState>
                )}
              </>
            )}
            <div className="flex flex-wrap gap-3 items-center mt-6">
              {step === 1 && (
                <button className="button-secondary" onClick={() => go(0)}>
                  ← Voltar às categorias
                </button>
              )}
              <button
                className="button-secondary"
                disabled={loading || page === 1}
                onClick={() => {
                  setPage((p) => p - 1);
                  setLoading(true);
                }}
              >
                Anterior
              </button>
              <span className="text-sm">
                Página {page} · {total} registro(s)
              </span>
              <button
                className="button-secondary"
                disabled={loading || page * 12 >= total}
                onClick={() => {
                  setPage((p) => p + 1);
                  setLoading(true);
                }}
              >
                Próxima
              </button>
            </div>
          </>
        ) : step === 2 && service ? (
          <form className="detail-grid" onSubmit={review}>
            <div className="space-y-6">
              <Panel
                title={service.name}
                subtitle={`${category?.name} · formulário básico`}
              >
                <div className="form-body">
                  <label className="form-label">
                    Assunto *
                    <input
                      className="field"
                      required
                      maxLength={160}
                      aria-invalid={!!error && !subject.trim()}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </label>
                  <label className="form-label">
                    Descrição *
                    <textarea
                      className="field min-h-28"
                      required
                      maxLength={4000}
                      aria-invalid={!!error && !description.trim()}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </label>
                  <p className="info-note">
                    Anexos e campos personalizados ainda não estão disponíveis
                    neste fluxo real.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => go(1)}
                    >
                      Voltar ao serviço
                    </button>
                    <button className="button-primary">
                      Revisar chamado <Icon name="arrow" />
                    </button>
                  </div>
                </div>
              </Panel>
            </div>
            <aside className="panel p-6">
              <p className="eyebrow">SUA SOLICITAÇÃO</p>
              <h2 className="text-lg font-semibold">{service.name}</h2>
              <p className="my-4 text-sm text-slate-500">{category?.name}</p>
              <p className="info-note">
                Sem escolher técnico ou horário. O chamado começa OPEN, sem
                prioridade e sem responsável.
              </p>
            </aside>
          </form>
        ) : service ? (
          <div className="space-y-6">
            <Panel title="Resumo da solicitação">
              <div className="form-body">
                <div className="summary-strip">
                  <span>{category?.name}</span>
                  <strong>{service.name}</strong>
                </div>
                <h2 className="text-xl font-semibold">{subject}</h2>
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {description}
                </p>
              </div>
            </Panel>
            <div className="flex flex-wrap gap-3">
              <button
                className="button-secondary"
                disabled={busy || uncertain}
                onClick={() => go(2)}
              >
                Voltar e editar
              </button>
              <button
                className="button-primary"
                disabled={busy || uncertain}
                onClick={() => void open()}
              >
                {busy ? 'Registrando…' : 'Abrir chamado'} <Icon name="check" />
              </button>
              <a className="text-button" href="#/requester/chamados">
                Ver meus chamados
              </a>
            </div>
            <p className="info-note">
              Um único serviço. A confirmação registra seu chamado no HelpDesk.
            </p>
          </div>
        ) : null}
      </MotionRegion>
    </div>
  );
}
