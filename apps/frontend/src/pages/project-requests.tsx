import { useEffect, useRef, useState } from 'react';
import type {
  PublicUser,
  ProjectWorkflow,
  ProjectPlan,
} from '@helpdesk/contracts';
import {
  projectPlanSchema,
  projectRequestInputSchema,
} from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { Icon, PageHeading, Panel, PriorityBadge } from '../components/ui';
import { DemoDialog } from '../components/demo-dialog';
import { MotionRegion } from '../components/motion-region';
import { TicketPagination } from '../components/ticket-pagination';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { date } from '../lib/presentation';
import { ProjectDashboard } from './project-dashboard';
import { DynamicServiceFields } from '../components/dynamic-service-fields';
import { OpeningFileField } from '../components/opening-file-field';
import { ProjectAttachments } from '../components/project-attachments';
import { TicketConversation } from '../components/ticket-conversation';
import type { OpeningUpload } from '@helpdesk/contracts';
import type { ServiceForm } from '@helpdesk/contracts';
import { projectArea, projectLabels } from '../lib/project-presentation';
import { href } from '../navigation/routes';
export function ProjectRequests({
  user,
  id,
  onExpired,
  compact = false,
}: {
  user: PublicUser;
  id?: string;
  onExpired: () => void;
  compact?: boolean;
}) {
  if (compact) return <ProjectDashboard user={user} onExpired={onExpired} />;
  return id ? (
    <ProjectDetail
      key={user.id + id}
      id={id}
      user={user}
      onExpired={onExpired}
    />
  ) : (
    <ProjectList user={user} onExpired={onExpired} />
  );
}
function Badge({ state }: { state: string }) {
  return (
    <span
      className={
        'badge status-' +
        (state === 'COMPLETED'
          ? 'closed'
          : state === 'CANCELED'
            ? 'pending'
            : state === 'IN_PROGRESS'
              ? 'in_progress'
              : 'open')
      }
    >
      {projectLabels[state] ?? state}
    </span>
  );
}
function ProjectPriority({
  priority,
}: {
  priority: ProjectWorkflow['priority'];
}) {
  return priority ? (
    <PriorityBadge priority={priority} />
  ) : (
    <span className="priority priority-none">Não definida</span>
  );
}
function ProjectFormAnswers({ id }: { id: string }) {
  const [data, setData] = useState<
      Awaited<ReturnType<typeof authClient.projectSubmission>> | undefined
    >(),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    authClient
      .projectSubmission(id)
      .then((v) => {
        if (alive) setData(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [id]);
  return (
    <Panel title="Formulário da solicitação">
      {error ? (
        <p role="alert" className="form-error form-body">
          {error}
        </p>
      ) : data === undefined ? (
        <p role="status" className="form-body">
          Consultando respostas…
        </p>
      ) : data === null ? (
        <p className="form-body">
          Solicitação anterior à integração dos formulários. Nenhuma resposta
          foi inventada.
        </p>
      ) : (
        <div className="form-body project-answers">
          <p className="project-form-version">
            {data.snapshot.categoryName} · versão {data.snapshot.version}
          </p>
          <dl className="answer-summary project-answer-grid">
            {data.snapshot.fields.map((f) => {
              const answer = data.answers[f.key];
              return (
                <div className="project-answer-card" key={f.id}>
                  <dt>{f.label}</dt>
                  <dd className="whitespace-pre-wrap break-words">
                    {answer === undefined || answer === '' ? (
                      <span className="answer-missing">Não informado</span>
                    ) : f.type === 'FILE' ? (
                      <a className="text-button" href="#project-attachments">
                        {(answer as string[]).length} arquivo(s) · ver anexos
                      </a>
                    ) : Array.isArray(answer) ? (
                      <span className="answer-chips">
                        {(answer as string[]).map((x) => (
                          <span key={x}>{x}</span>
                        ))}
                      </span>
                    ) : typeof answer === 'boolean' ? (
                      answer ? (
                        'Sim'
                      ) : (
                        'Não'
                      )
                    ) : f.type === 'DATE' && typeof answer === 'string' ? (
                      new Date(`${answer}T12:00:00`).toLocaleDateString('pt-BR')
                    ) : f.type === 'NUMBER' && typeof answer === 'number' ? (
                      answer.toLocaleString('pt-BR')
                    ) : f.type === 'DATE_TIME' && typeof answer === 'string' ? (
                      new Date(answer).toLocaleString('pt-BR')
                    ) : (
                      String(answer)
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
    </Panel>
  );
}
function failure(e: unknown, onExpired: () => void) {
  if (e instanceof AuthError && e.status === 401) {
    onExpired();
    return 'Sessão expirada.';
  }
  return e instanceof AuthError
    ? e.message
    : 'Não foi possível confirmar a operação. Preserve o texto e tente consultar novamente.';
}
function NewProject({
  onClose,
  onCreated,
  onExpired,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  onExpired: () => void;
}) {
  const [uploads, setUploads] = useState<Record<string, OpeningUpload[]>>({}),
    [uploadPending, setUploadPending] = useState(0);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<
      Awaited<ReturnType<typeof authClient.projectCategories>>
    >([]),
    [category, setCategory] = useState(''),
    [form, setForm] = useState<ServiceForm['published']>(null),
    [answers, setAnswers] = useState<
      Record<string, string | string[] | number | boolean>
    >({});
  useEffect(() => {
    let alive = true;
    authClient
      .projectCategories()
      .then((v) => {
        if (alive) setCategories(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    let alive = true;
    if (category)
      authClient
        .projectCategoryForm(category)
        .then((v) => {
          if (alive) setForm(v.published);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    return () => {
      alive = false;
    };
  }, [category]);
  const [input, setInput] = useState({
      title: '',
      objective: '',
      need: '',
    }),
    [busy, setBusy] = useState(false),
    lock = useRef(false),
    key = useRef(crypto.randomUUID());
  async function submit() {
    if (lock.current || uploadPending) return;
    if (!category || !form) {
      setError('Selecione uma categoria ativa com formulário publicado.');
      return;
    }
    const v = projectRequestInputSchema.safeParse({
      ...input,
      ...(form.fields.some((f) => f.key === 'objective')
        ? { objective: answers.objective }
        : {}),
      ...(form.fields.some((f) => f.key === 'need')
        ? { need: answers.need }
        : {}),
    });
    if (!v.success) {
      setError(
        'Informe título de 3 a 160 caracteres e objetivo/necessidade de 10 a 4000.',
      );
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const p = await authClient.requestProject({
        ...v.data,
        clientOperationId: key.current,
        form: { categoryId: category, versionId: form.id, answers },
      });
      onCreated(p.id);
    } catch (e) {
      setError(failure(e, onExpired));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <DemoDialog
      title="Solicitar projeto"
      eyebrow="PROJETO REAL"
      description="Registre o objetivo e a necessidade. O responsável será definido na gestão autorizada."
      pending={busy || uploadPending > 0}
      confirmLabel={busy ? 'Enviando…' : 'Enviar solicitação'}
      onCancel={() => {
        if (!busy && !uploadPending) {
          void Promise.allSettled(
            Object.values(uploads)
              .flat()
              .map((f) => authClient.discardProjectOpeningFile(f.id)),
          );
          onClose();
        }
      }}
      onConfirm={() => {
        void submit();
        return false;
      }}
    >
      <div className="space-y-4">
        <label className="form-label">
          Categoria de Projeto
          <select
            className="field"
            value={category}
            disabled={busy || uploadPending > 0}
            onChange={(e) => {
              key.current = crypto.randomUUID();
              setCategory(e.target.value);
              void Promise.allSettled(
                Object.values(uploads)
                  .flat()
                  .map((f) => authClient.discardProjectOpeningFile(f.id)),
              );
              setUploads({});
              setForm(null);
              setAnswers({});
              setError('');
            }}
          >
            <option value="">Selecione uma categoria</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {category && !form && (
          <p role="status">Carregando formulário publicado…</p>
        )}
        {form && (
          <DynamicServiceFields
            fields={form.fields}
            answers={answers}
            disabled={busy}
            onChange={(field, value) => {
              key.current = crypto.randomUUID();
              setAnswers((v) => ({ ...v, [field]: value }));
            }}
            renderFile={(field) => (
              <OpeningFileField
                key={category + form.id + field.id}
                project
                serviceId={category}
                formVersionId={form.id}
                fieldKey={field.key}
                files={uploads[field.key] ?? []}
                disabled={busy}
                onExpired={onExpired}
                onPending={(delta) =>
                  setUploadPending((v) => Math.max(0, v + delta))
                }
                onChange={(files) => {
                  key.current = crypto.randomUUID();
                  setError('');
                  setUploads((v) => ({ ...v, [field.key]: files }));
                  setAnswers((v) => ({
                    ...v,
                    [field.key]: files.map((f) => f.id),
                  }));
                }}
              />
            )}
          />
        )}
        {(['title', 'objective', 'need'] as const).map(
          (f, i) =>
            !form?.fields.some((field) => field.key === f) && (
              <label className="form-label" key={f}>
                {['Título', 'Objetivo', 'Necessidade'][i]}
                {f === 'title' ? (
                  <input
                    className="field"
                    value={input[f]}
                    maxLength={160}
                    disabled={busy}
                    onChange={(e) => {
                      key.current = crypto.randomUUID();
                      setInput((v) => ({ ...v, [f]: e.target.value }));
                    }}
                  />
                ) : (
                  <textarea
                    className="field"
                    value={input[f]}
                    maxLength={4000}
                    disabled={busy}
                    onChange={(e) => {
                      key.current = crypto.randomUUID();
                      setInput((v) => ({ ...v, [f]: e.target.value }));
                    }}
                  />
                )}
              </label>
            ),
        )}
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </div>
    </DemoDialog>
  );
}
function ProjectList({
  user,
  onExpired,
}: {
  user: PublicUser;
  onExpired: () => void;
}) {
  const [items, setItems] = useState<ProjectWorkflow[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [state, setState] = useState(''),
    [owner, setOwner] = useState(''),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(''),
    [revision, setRevision] = useState(0),
    [creating, setCreating] = useState(false);
  const debounced = useDebouncedValue(search.trim()),
    key = JSON.stringify([page, debounced, state, owner, revision]);
  useEffect(() => {
    let active = true;
    authClient
      .projectWorkflows({ page, search: debounced, state, ownerId: owner })
      .then((r) => {
        if (active) {
          setItems(r.items);
          setTotal(r.total);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(failure(e, onExpired));
      })
      .finally(() => {
        if (active) setLoaded(key);
      });
    return () => {
      active = false;
    };
  }, [page, debounced, state, owner, key, onExpired]);
  return (
    <>
      <PageHeading
        eyebrow="PROJETOS"
        title="Projetos e solicitações"
        description="Planejamento, execução e acompanhamento com histórico e progresso por atividades."
      />
      <Panel
        title="Projetos autorizados"
        action={
          user.role === 'REQUESTER' ? (
            <button
              className="button-primary"
              onClick={() => setCreating(true)}
            >
              Solicitar projeto
            </button>
          ) : (
            <button
              className="text-button"
              onClick={() => setRevision((v) => v + 1)}
            >
              Atualizar
            </button>
          )
        }
      >
        <div className="form-body grid gap-3 md:grid-cols-3">
          <label className="form-label">
            Buscar projeto
            <input
              className="field"
              type="search"
              maxLength={120}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="form-label">
            Status
            <select
              className="field"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os estados</option>
              {Object.entries(projectLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {user.role === 'ADMIN' && (
            <TechnicianPicker
              value={owner}
              onChange={(v) => {
                setOwner(v);
                setPage(1);
              }}
              onExpired={onExpired}
              optional
            />
          )}
        </div>
        {error && (
          <p className="form-error px-6" role="alert">
            {error}
          </p>
        )}
        {loaded !== key && (
          <p className="px-6" role="status">
            Atualizando projetos…
          </p>
        )}
        <div className="table-scroll" aria-busy={loaded !== key}>
          <div
            className="mobile-record-list project-mobile-list"
            aria-label="Lista de projetos"
          >
            {items.map((p) => (
              <article className="mobile-record-card" key={p.id}>
                <a
                  className="mobile-record-title"
                  href={'#/' + projectArea(user) + '/projetos/' + p.id}
                >
                  PR-{p.code} · {p.title}
                </a>
                <div className="mobile-record-meta">
                  <span>
                    <small>Status</small>
                    <Badge state={p.state} />
                  </span>
                  <span>
                    <small>Prioridade</small>
                    <ProjectPriority priority={p.priority} />
                  </span>
                  <span>
                    <small>Responsável</small>
                    {p.owner?.name ?? 'Sem responsável'}
                  </span>
                  <span>
                    <small>Progresso</small>
                    {p.progress
                      ? `${p.progress.percent}% · ${p.progress.done}/${p.progress.total}`
                      : 'Ainda sem plano'}
                  </span>
                  <span>
                    <small>Solicitação</small>
                    {date(p.createdAt)}
                  </span>
                </div>
              </article>
            ))}
          </div>
          <table className="ticket-table project-list-table">
            <thead>
              <tr>
                <th>Projeto</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Responsável</th>
                <th>Progresso</th>
                <th>Solicitação</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <a
                      className="ticket-number"
                      href={'#/' + projectArea(user) + '/projetos/' + p.id}
                    >
                      PR-{p.code} · {p.title}
                    </a>
                  </td>
                  <td>
                    <Badge state={p.state} />
                  </td>
                  <td>
                    <ProjectPriority priority={p.priority} />
                  </td>
                  <td>{p.owner?.name ?? 'Sem responsável'}</td>
                  <td>
                    {p.progress
                      ? `${p.progress.percent}% · ${p.progress.done}/${p.progress.total}`
                      : 'Ainda sem plano'}
                  </td>
                  <td>{date(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loaded === key && !items.length && (
          <p className="p-6">Nenhum projeto encontrado neste escopo.</p>
        )}
        <TicketPagination
          page={page}
          total={total}
          busy={loaded !== key}
          onPage={setPage}
        />
      </Panel>
      {creating && (
        <NewProject
          onExpired={onExpired}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            window.location.hash = '#/' + projectArea(user) + '/projetos/' + id;
          }}
        />
      )}
    </>
  );
}
function TechnicianPicker({
  value,
  onChange,
  onExpired,
  optional = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onExpired: () => void;
  optional?: boolean;
}) {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    authClient
      .assigneeOptions(() => !active)
      .then((v) => {
        if (active) setItems(v);
      })
      .catch((e) => {
        if (active) setError(failure(e, onExpired));
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [onExpired]);
  return (
    <label className="form-label">
      Responsável técnico
      <select
        className="field"
        value={value}
        disabled={!loaded || !!error}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {!loaded
            ? 'Carregando…'
            : optional
              ? 'Todos os responsáveis'
              : 'Selecione um técnico elegível'}
        </option>
        {items.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      {error && (
        <span className="form-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
const activityLabels = {
  TODO: 'A fazer',
  IN_PROGRESS: 'Em execução',
  DONE: 'Concluída',
};
function PlanView({
  plan,
  onActivity,
  onStageComplete,
}: {
  plan: NonNullable<ProjectWorkflow['plan']>;
  onActivity?: (id: string) => void;
  onStageComplete?: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Plano v{plan.version} · publicado em {date(plan.createdAt)}
      </p>
      {plan.stages.map((s) => (
        <section
          key={s.id}
          className="rounded-xl border border-slate-200 p-4 space-y-3"
        >
          <h3 className="font-semibold">
            {s.order}. {s.title}
          </h3>
          {s.description && (
            <p className="whitespace-pre-wrap break-words">{s.description}</p>
          )}
          <p className="text-sm">
            {s.progress
              ? `${s.progress.percent}% · ${s.progress.done}/${s.progress.total} atividades`
              : 'Sem atividades'}
          </p>
          <p className="text-sm font-medium">
            Estado: {activityLabels[s.state]}
            {s.completedAt ? ` · Concluída em ${date(s.completedAt)}` : ''}
          </p>
          {onStageComplete && s.state !== 'DONE' && (
            <button
              className="button-secondary"
              onClick={() => onStageComplete(s.id)}
            >
              Feito
            </button>
          )}
          {s.activities.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-3 border-t border-slate-200 pt-3"
            >
              <div>
                <h4 className="font-medium">
                  {a.order}. {a.title}
                </h4>
                <p className="whitespace-pre-wrap break-words text-sm">
                  {a.description}
                </p>
                <span className="text-sm text-slate-500">
                  {activityLabels[a.state]}
                </span>
              </div>
              {onActivity && (
                <button
                  className="button-secondary"
                  onClick={() => onActivity(a.id)}
                >
                  Atualizar atividade
                </button>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
function PlanEditor({
  initial,
  busy,
  canPublish,
  onSave,
  onClose,
  error,
}: {
  initial: ProjectPlan;
  busy: boolean;
  canPublish: boolean;
  onSave: (p: ProjectPlan, publish: boolean) => void;
  onClose: () => void;
  error: string;
}) {
  const [plan, setPlan] = useState<ProjectPlan>(() => structuredClone(initial)),
    [localError, setLocalError] = useState('');
  function change(fn: (p: ProjectPlan) => void) {
    setPlan((old) => {
      const copy = structuredClone(old);
      fn(copy);
      copy.stages.forEach((s, i) => {
        s.order = i + 1;
        s.activities.forEach((a, j) => (a.order = j + 1));
      });
      return copy;
    });
  }
  const total = plan.stages.reduce((n, s) => n + s.activities.length, 0);
  function save() {
    const v = projectPlanSchema.safeParse(plan);
    if (!v.success) {
      setLocalError(
        'Confira títulos (mínimo 3 caracteres), descrições e limites de 25 etapas/200 atividades.',
      );
      return;
    }
    onSave(v.data, canPublish);
  }
  return (
    <DemoDialog
      title="Rascunho do plano"
      eyebrow="PLANEJAMENTO VERSIONADO"
      description={
        canPublish
          ? 'O planejamento será validado, salvo e publicado em uma nova versão imutável.'
          : 'O rascunho será salvo. A publicação depende da permissão e do estado do projeto.'
      }
      pending={busy}
      confirmLabel={
        busy
          ? 'Salvando…'
          : canPublish
            ? 'Salvar e publicar'
            : 'Salvar rascunho'
      }
      onConfirm={() => {
        save();
        return false;
      }}
      onCancel={() => {
        if (!busy) onClose();
      }}
    >
      <fieldset disabled={busy} className="space-y-5">
        <p>
          {plan.stages.length}/25 etapas · {total}/200 atividades
        </p>
        {plan.stages.map((s, i) => (
          <section
            key={s.id ?? 'stage-' + i}
            className="rounded-xl border border-slate-200 p-3 space-y-3"
          >
            <label className="form-label">
              Etapa {i + 1}
              <input
                className="field"
                value={s.title}
                maxLength={160}
                onChange={(e) =>
                  change((p) => {
                    p.stages[i]!.title = e.target.value;
                  })
                }
              />
            </label>
            <label className="form-label">
              Descrição da etapa
              <textarea
                className="field"
                maxLength={2000}
                value={s.description}
                onChange={(e) =>
                  change((p) => {
                    p.stages[i]!.description = e.target.value;
                  })
                }
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                className="text-button"
                type="button"
                disabled={i === 0}
                onClick={() =>
                  change((p) => {
                    [p.stages[i - 1], p.stages[i]] = [
                      p.stages[i]!,
                      p.stages[i - 1]!,
                    ];
                  })
                }
              >
                ↑ Etapa
              </button>
              <button
                className="text-button"
                type="button"
                disabled={i === plan.stages.length - 1}
                onClick={() =>
                  change((p) => {
                    [p.stages[i + 1], p.stages[i]] = [
                      p.stages[i]!,
                      p.stages[i + 1]!,
                    ];
                  })
                }
              >
                ↓ Etapa
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  change((p) => {
                    p.stages.splice(i, 1);
                  })
                }
              >
                Remover etapa
              </button>
            </div>
            {s.activities.map((a, j) => (
              <div
                className="border-t border-slate-200 pt-3 space-y-2"
                key={a.id ?? 'activity-' + j}
              >
                <label className="form-label">
                  Atividade {j + 1}
                  <input
                    className="field"
                    value={a.title}
                    maxLength={160}
                    onChange={(e) =>
                      change((p) => {
                        p.stages[i]!.activities[j]!.title = e.target.value;
                      })
                    }
                  />
                </label>
                <label className="form-label">
                  Descrição da atividade
                  <textarea
                    className="field"
                    maxLength={2000}
                    value={a.description}
                    onChange={(e) =>
                      change((p) => {
                        p.stages[i]!.activities[j]!.description =
                          e.target.value;
                      })
                    }
                  />
                </label>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="text-button"
                    disabled={j === 0}
                    onClick={() =>
                      change((p) => {
                        const tasks = p.stages[i]!.activities;
                        [tasks[j - 1], tasks[j]] = [tasks[j]!, tasks[j - 1]!];
                      })
                    }
                  >
                    ↑ Atividade
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    disabled={j === s.activities.length - 1}
                    onClick={() =>
                      change((p) => {
                        const tasks = p.stages[i]!.activities;
                        [tasks[j + 1], tasks[j]] = [tasks[j]!, tasks[j + 1]!];
                      })
                    }
                  >
                    ↓ Atividade
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      change((p) => {
                        p.stages[i]!.activities.splice(j, 1);
                      })
                    }
                  >
                    Remover atividade
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className="button-secondary"
              disabled={total >= 200}
              onClick={() =>
                change((p) => {
                  p.stages[i]!.activities.push({
                    title: '',
                    description: '',
                    order: s.activities.length + 1,
                  });
                })
              }
            >
              Adicionar atividade
            </button>
          </section>
        ))}
        <button
          type="button"
          className="button-secondary"
          disabled={plan.stages.length >= 25}
          onClick={() =>
            change((p) => {
              p.stages.push({
                title: '',
                description: '',
                order: p.stages.length + 1,
                activities: [],
              });
            })
          }
        >
          Adicionar etapa
        </button>
        {(localError || error) && (
          <p className="form-error" role="alert">
            {localError || error}
          </p>
        )}
      </fieldset>
    </DemoDialog>
  );
}
type Action = { op: string; activityId?: string; correctionOf?: string };
type ProjectSection = 'project-plan' | 'project-records';

export function ProjectDetailActions({
  workflow: w,
  role,
  busy,
  onEdit,
  onAction,
  onSection,
}: {
  workflow: ProjectWorkflow;
  role: PublicUser['role'];
  busy: boolean;
  onEdit: () => void;
  onAction: (action: Action) => void;
  onSection: (section: ProjectSection, versions?: boolean) => void;
}) {
  const canEdit =
    w.permissions.manage && ['PLANNING', 'IN_PROGRESS'].includes(w.state);
  const canPlan = role === 'ADMIN' && w.state === 'REQUESTED' && !!w.owner;
  const canStart = w.permissions.execute && w.state === 'PLANNING' && !!w.plan;
  const canComplete = w.permissions.execute && w.state === 'IN_PROGRESS';
  const hasSecondary =
    w.plan ||
    w.permissions.manage ||
    w.permissions.setPriority ||
    w.permissions.retire;
  if (!canEdit && !canPlan && !canStart && !canComplete && !hasSecondary)
    return null;

  return (
    <section className="project-actions" aria-label="Ações do projeto">
      {(canEdit || w.plan || canPlan || canStart || canComplete) && (
        <div
          className="project-action-group"
          role="group"
          aria-label="Ações principais"
        >
          {canEdit && (
            <button className="button-primary" disabled={busy} onClick={onEdit}>
              {w.draft || w.plan ? 'Editar plano' : 'Criar plano'}
            </button>
          )}
          {w.plan && (
            <button
              className="button-secondary"
              onClick={() => onSection('project-plan')}
            >
              Consultar planejamento
            </button>
          )}
          {canEdit && w.plan && (
            <button
              className="button-secondary"
              onClick={() => onSection('project-plan')}
            >
              Gerenciar etapas
            </button>
          )}
          {canPlan && (
            <button
              className="button-secondary"
              disabled={busy}
              onClick={() => onAction({ op: 'planning' })}
            >
              Iniciar planejamento
            </button>
          )}
          {canStart && (
            <button
              className="button-secondary"
              disabled={busy}
              onClick={() => onAction({ op: 'start' })}
            >
              Iniciar execução
            </button>
          )}
          {canComplete && (
            <button
              className="button-primary"
              disabled={busy}
              onClick={() => onAction({ op: 'complete' })}
            >
              Concluir projeto
            </button>
          )}
        </div>
      )}
      {hasSecondary && (
        <div
          className="project-action-group"
          role="group"
          aria-label="Ações secundárias"
        >
          {w.plan && (
            <button
              className="button-secondary"
              onClick={() => onSection('project-records', true)}
            >
              Visualizar versões
            </button>
          )}
          {w.permissions.manage && w.draft && (
            <button
              className="button-secondary"
              disabled={busy}
              onClick={() => onAction({ op: 'draft-delete' })}
            >
              Descartar rascunho
            </button>
          )}
          {w.permissions.setPriority && (
            <button
              className="button-secondary"
              disabled={busy}
              onClick={() => onAction({ op: 'priority' })}
            >
              Alterar prioridade
            </button>
          )}
          {w.permissions.manage && (
            <button
              className="button-secondary"
              disabled={busy}
              onClick={() => onAction({ op: 'updates' })}
            >
              Adicionar atualização
            </button>
          )}
          {w.permissions.retire && (
            <button
              className="button-secondary"
              disabled={busy}
              onClick={() => onAction({ op: 'retire' })}
            >
              <Icon name="trash" /> Excluir projeto
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function ProjectSummary({ workflow: w }: { workflow: ProjectWorkflow }) {
  return (
    <Panel title="Resumo do projeto">
      <div className="form-body space-y-3">
        <Badge state={w.state} />
        <p className="wrap-anywhere">
          Solicitante: {w.requesterName ?? 'Não informado'}
        </p>
        <p>Responsável: {w.owner?.name ?? 'Sem responsável'}</p>
        <p className="flex items-center gap-2">
          Prioridade <ProjectPriority priority={w.priority} />
        </p>
        <p>Solicitado em {date(w.createdAt)}</p>
        {w.startedAt && <p>Início: {date(w.startedAt)}</p>}
        {w.completedAt && <p>Conclusão: {date(w.completedAt)}</p>}
        {w.canceledAt && <p>Cancelamento: {date(w.canceledAt)}</p>}
        {w.progress ? (
          <div className="project-progress">
            <div className="project-progress-heading">
              <span>Progresso do plano</span>
              <strong>{w.progress.percent}%</strong>
            </div>
            <progress
              className="project-progress-track"
              aria-label="Progresso por atividades"
              value={w.progress.percent}
              max={100}
            />
            <p className="text-xs text-slate-500">
              {w.progress.done}/{w.progress.total} atividades
              {w.plan && ` · plano v${w.plan.version}`}
            </p>
          </div>
        ) : (
          <p>Ainda sem plano</p>
        )}
        <p className="text-xs text-slate-500">
          Revisão {w.revision}. Percentual não equivale a SLA ou conclusão
          automática.
        </p>
      </div>
    </Panel>
  );
}

function ProjectDetail({
  id,
  user,
  onExpired,
}: {
  id: string;
  user: PublicUser;
  onExpired: () => void;
}) {
  const [w, setW] = useState<ProjectWorkflow | null>(null),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [action, setAction] = useState<Action | null>(null),
    [editor, setEditor] = useState(false),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(''),
    [technician, setTechnician] = useState(''),
    [projectPriority, setProjectPriority] = useState<
      'HIGH' | 'MEDIUM' | 'LOW' | null
    >(null),
    [recordsTab, setRecordsTab] = useState<'updates' | 'history' | 'versions'>(
      'updates',
    ),
    [activityState, setActivityState] = useState('TODO'),
    [selectedVersion, setSelectedVersion] = useState<NonNullable<
      ProjectWorkflow['plan']
    > | null>(null);
  const lock = useRef(false),
    alive = useRef(true),
    pending = useRef<{ signature: string; body: object } | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    authClient
      .projectWorkflow(id)
      .then((v) => {
        if (active) setW(v);
      })
      .catch((e) => {
        if (active) {
          setW(null);
          setError(failure(e, onExpired));
        }
      });
    return () => {
      active = false;
    };
  }, [id, revision, onExpired]);
  function open(a: Action) {
    pending.current = null;
    setAction(a);
    setReason('');
    setTechnician('');
    setProjectPriority(w?.priority ?? null);
    setError('');
    const activity = w?.plan?.stages
      .flatMap((s) => s.activities)
      .find((v) => v.id === a.activityId);
    setActivityState(activity?.state ?? 'TODO');
  }
  function goToSection(section: ProjectSection, versions = false) {
    if (versions) setRecordsTab('versions');
    const target = document.getElementById(section);
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: 'start' });
  }
  async function write(
    op: string,
    fields: object,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST',
  ) {
    if (!w || lock.current) return false;
    const signature = JSON.stringify([op, fields]);
    if (!pending.current || pending.current.signature !== signature)
      pending.current = {
        signature,
        body: {
          ...fields,
          expectedRevision: w.revision,
          clientOperationId: crypto.randomUUID(),
        },
      };
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await authClient.projectWrite(id, op, pending.current.body, method);
      if (alive.current) {
        pending.current = null;
        setAction(null);
        setEditor(false);
        if (op === 'retire') {
          window.location.hash = href(
            user.role.toLowerCase() as 'requester' | 'technician' | 'admin',
            'projetos',
          );
          return true;
        }
        setNotice('Alteração confirmada e registrada no histórico.');
        setRevision((v) => v + 1);
      }
      return true;
    } catch (e) {
      if (alive.current) {
        setError(
          e instanceof AuthError && e.status === 409
            ? op === 'complete'
              ? e.message
              : 'O projeto mudou. Seu rascunho foi preservado; revise os dados atualizados antes de confirmar novamente.'
            : failure(e, onExpired),
        );
        if (e instanceof AuthError && e.status === 409) {
          pending.current = null;
          setRevision((v) => v + 1);
        }
      }
      return false;
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function savePlan(plan: ProjectPlan, publish: boolean) {
    if (!w || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await authClient.projectWrite(
        id,
        'plan-draft',
        {
          definition: plan,
          expectedRevision: w.revision,
          clientOperationId: crypto.randomUUID(),
        },
        'PUT',
      );
      if (!publish) {
        setEditor(false);
        setNotice('Rascunho salvo e registrado no histórico.');
        setRevision((n) => n + 1);
        return;
      }
      try {
        const published = await authClient.projectWrite(
          id,
          'plan-publication',
          {
            reason: 'Publicação do planejamento validado.',
            expectedRevision: saved.revision,
            clientOperationId: crypto.randomUUID(),
          },
        );
        setW(published);
        setEditor(false);
        setNotice(
          `Plano v${published.plan?.version ?? ''} publicado e disponível para consulta.`,
        );
      } catch (e) {
        setW(saved);
        setError(
          `O rascunho foi salvo, mas não foi publicado. ${failure(e, onExpired)}`,
        );
      }
      setRevision((n) => n + 1);
    } catch (e) {
      setError(failure(e, onExpired));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function confirm() {
    if (!action) return;
    const op = action.op;
    if (op === 'stage-complete') {
      void write('stages/' + action.activityId + '/complete', {}, 'POST');
      return;
    }
    if (op === 'assignment' && !technician) {
      setError('Selecione um técnico elegível.');
      return;
    }
    if (op === 'priority' && !projectPriority) {
      setError('Selecione uma prioridade para classificar o projeto.');
      return;
    }
    if (
      [
        'assignment',
        'planning',
        'plan-publication',
        'complete',
        'cancel',
        'retire',
      ].includes(op) &&
      reason.trim().length < 3
    ) {
      setError('Informe justificativa ou resumo com ao menos 3 caracteres.');
      return;
    }
    if (op === 'updates' && !reason.trim()) {
      setError('Escreva a atualização.');
      return;
    }
    void write(
      op === 'activity'
        ? 'activities/' + action.activityId
        : op === 'draft-delete'
          ? 'plan-draft'
          : op,
      op === 'assignment'
        ? { technicianId: technician, reason }
        : op === 'priority'
          ? { priority: projectPriority, reason }
          : op === 'activity'
            ? { state: activityState, reason }
            : op === 'draft-delete'
              ? {}
              : op === 'updates'
                ? {
                    content: reason,
                    ...(action.correctionOf
                      ? { correctionOf: action.correctionOf }
                      : {}),
                  }
                : op === 'start'
                  ? {}
                  : { reason },
      op === 'activity' ? 'PATCH' : op === 'draft-delete' ? 'DELETE' : 'POST',
    );
  }
  const names: Record<string, string> = {
    assignment: 'Definir responsável',
    priority: 'Alterar prioridade',
    'draft-delete': 'Excluir rascunho',
    retire: 'Excluir projeto',
    planning: 'Iniciar planejamento',
    'plan-publication': 'Publicar plano',
    start: 'Iniciar execução',
    complete: 'Concluir projeto',
    cancel: 'Cancelar projeto',
    updates: action?.correctionOf
      ? 'Corrigir atualização'
      : 'Publicar atualização',
    activity: 'Atualizar atividade',
    'stage-complete': 'Concluir etapa',
  };
  const draft = w?.draft ?? {
    stages:
      w?.plan?.stages.map((s) => ({
        id: s.id,
        title: s.title,
        description: s.description,
        order: s.order,
        activities: s.activities.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          order: a.order,
        })),
      })) ?? [],
  };
  return (
    <>
      <a className="back-link" href={'#/' + projectArea(user) + '/projetos'}>
        ← Voltar aos projetos
      </a>
      <PageHeading
        eyebrow={'PROJETO PR-' + (w?.code ?? '…')}
        title={w?.title ?? 'Consultando projeto'}
        description="Solicitação original preservada e acompanhamento versionado."
      />
      {w && (
        <ProjectDetailActions
          workflow={w}
          role={user.role}
          busy={busy}
          onEdit={() => {
            pending.current = null;
            setError('');
            setEditor(true);
          }}
          onAction={open}
          onSection={goToSection}
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="info-note" role="status">
          {notice}
        </p>
      )}
      {!w && !error && <p role="status">Consultando projeto…</p>}
      {w && (
        <MotionRegion motionKey={'workflow-' + id} reveal className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
            <Panel title="Objetivo e necessidade">
              <div className="form-body space-y-4">
                <h2 className="font-semibold">Objetivo</h2>
                <p className="whitespace-pre-wrap break-words">{w.objective}</p>
                <h2 className="font-semibold">Necessidade</h2>
                <p className="whitespace-pre-wrap break-words">{w.need}</p>
              </div>
            </Panel>
            <ProjectSummary workflow={w} />
          </div>
          <ProjectFormAnswers id={id} />
          <section id="project-attachments" className="scroll-mt-24">
            <ProjectAttachments id={id} onExpired={onExpired} />
          </section>
          <TicketConversation
            id={id}
            status={w.state}
            user={user}
            onExpired={onExpired}
            onChanged={() => {}}
            resource="project-conversation"
            contextLabel="projeto"
            allowWrite={!['COMPLETED', 'CANCELED'].includes(w.state)}
            allowSolve={false}
          />
          <nav className="dashboard-sections" aria-label="Seções do projeto">
            <button type="button" onClick={() => goToSection('project-plan')}>
              Etapas e atividades
            </button>
            <button
              type="button"
              onClick={() => goToSection('project-records')}
            >
              Atualizações e histórico
            </button>
          </nav>
          <div
            className="flex flex-wrap gap-3"
            role="group"
            aria-label="Ações autorizadas do projeto"
          >
            {w.permissions.assign && (
              <button
                className="button-secondary"
                disabled={busy}
                onClick={() => open({ op: 'assignment' })}
              >
                Definir responsável
              </button>
            )}
            {w.permissions.cancel && (
              <button
                className="text-button"
                onClick={() => open({ op: 'cancel' })}
              >
                Cancelar projeto
              </button>
            )}
            <button
              className="text-button"
              onClick={() => setRevision((v) => v + 1)}
            >
              Atualizar consulta
            </button>
          </div>
          <section id="project-plan" tabIndex={-1} className="scroll-mt-24">
            <Panel title="Etapas e atividades publicadas">
              <div className="form-body">
                {w.plan ? (
                  <PlanView
                    plan={w.plan}
                    onActivity={
                      w.permissions.execute && w.state === 'IN_PROGRESS'
                        ? (id) => open({ op: 'activity', activityId: id })
                        : undefined
                    }
                    onStageComplete={
                      w.permissions.execute && w.state === 'IN_PROGRESS'
                        ? (stageId) =>
                            open({ op: 'stage-complete', activityId: stageId })
                        : undefined
                    }
                  />
                ) : (
                  <p>Ainda sem plano publicado.</p>
                )}
              </div>
            </Panel>
          </section>
          <section id="project-records" tabIndex={-1} className="scroll-mt-24">
            <ProjectRecords
              key={id + ':' + revision + ':' + recordsTab}
              id={id}
              initialTab={recordsTab}
              manager={w.permissions.manage}
              onExpired={onExpired}
              onCorrect={(key) => open({ op: 'updates', correctionOf: key })}
              onVersion={(v) => {
                authClient
                  .projectVersion(id, v)
                  .then(setSelectedVersion)
                  .catch((e) => setError(failure(e, onExpired)));
              }}
            />
          </section>
        </MotionRegion>
      )}
      {editor && w && (
        <PlanEditor
          initial={draft}
          busy={busy}
          canPublish={w.permissions.publish}
          error={error}
          onClose={() => setEditor(false)}
          onSave={(p, publish) => void savePlan(p, publish)}
        />
      )}
      {action && (
        <DemoDialog
          title={names[action.op]!}
          eyebrow="OPERAÇÃO REAL · AUDITÁVEL"
          description={
            action.op === 'cancel'
              ? 'O cancelamento é terminal e preserva o histórico.'
              : action.op === 'retire'
                ? 'O projeto será retirado das visualizações operacionais. Dados, anexos, conversa e auditoria serão preservados; esta ação não cancela nem apaga o registro.'
                : action.op === 'draft-delete'
                  ? 'Somente o rascunho será removido. Versões publicadas e histórico permanecem imutáveis.'
                  : action.op === 'plan-publication'
                    ? 'Uma nova versão imutável será publicada. Revisões podem alterar o percentual, preservando os estados das atividades mantidas.'
                    : 'A confirmação depende das permissões e da revisão atual do servidor.'
          }
          pending={busy}
          confirmLabel={busy ? 'Confirmando…' : 'Confirmar'}
          onCancel={() => {
            if (!busy) setAction(null);
          }}
          onConfirm={() => {
            confirm();
            return false;
          }}
        >
          <div className="space-y-4">
            {action.op === 'assignment' && (
              <TechnicianPicker
                value={technician}
                onChange={setTechnician}
                onExpired={onExpired}
              />
            )}
            {action.op === 'activity' && (
              <label className="form-label">
                Situação da atividade
                <select
                  className="field"
                  value={activityState}
                  onChange={(e) => setActivityState(e.target.value)}
                >
                  {Object.entries(activityLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {action.op === 'priority' && (
              <label className="form-label">
                Prioridade do projeto
                <select
                  className="field"
                  value={projectPriority ?? ''}
                  disabled={busy}
                  onChange={(e) =>
                    setProjectPriority(
                      (e.target.value || null) as
                        'HIGH' | 'MEDIUM' | 'LOW' | null,
                    )
                  }
                >
                  <option value="">Selecione prioridade</option>
                  <option value="HIGH">Alta</option>
                  <option value="MEDIUM">Média</option>
                  <option value="LOW">Baixa</option>
                </select>
              </label>
            )}
            {action.op !== 'start' && action.op !== 'stage-complete' && (
              <label className="form-label">
                {action.op === 'updates'
                  ? 'Atualização'
                  : action.op === 'complete'
                    ? 'Resumo obrigatório da entrega'
                    : action.op === 'activity'
                      ? 'Justificativa (obrigatória para retrabalho)'
                      : 'Justificativa'}
                <textarea
                  className="field"
                  maxLength={action.op === 'updates' ? 4000 : 2000}
                  value={reason}
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </DemoDialog>
      )}
      {selectedVersion && (
        <DemoDialog
          title={'Plano histórico v' + selectedVersion.version}
          eyebrow="DEFINIÇÃO IMUTÁVEL"
          description="A definição é histórica; a situação operacional das atividades é a atual. Consulte os eventos para estados anteriores."
          confirmLabel="Fechar"
          onConfirm={() => {
            setSelectedVersion(null);
          }}
          onCancel={() => setSelectedVersion(null)}
        >
          <PlanView plan={selectedVersion} />
        </DemoDialog>
      )}
    </>
  );
}
function ProjectRecords({
  id,
  initialTab = 'updates',
  manager,
  onExpired,
  onCorrect,
  onVersion,
}: {
  id: string;
  initialTab?: 'updates' | 'history' | 'versions';
  manager: boolean;
  onExpired: () => void;
  onCorrect: (id: string) => void;
  onVersion: (v: number) => void;
}) {
  const [tab, setTab] = useState<'updates' | 'history' | 'versions'>(
      initialTab,
    ),
    [page, setPage] = useState(1),
    [data, setData] = useState<{
      items: Record<string, unknown>[];
      total: number;
    }>({ items: [], total: 0 }),
    [loaded, setLoaded] = useState(''),
    [error, setError] = useState('');
  const key = tab + ':' + page;
  useEffect(() => {
    let active = true;
    const read =
      tab === 'updates'
        ? authClient.projectUpdates(id, page)
        : tab === 'history'
          ? authClient.projectWorkflowHistory(id, page)
          : authClient.projectVersions(id, page);
    read
      .then((r) => {
        if (active) {
          setData(r);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(failure(e, onExpired));
      })
      .finally(() => {
        if (active) setLoaded(key);
      });
    return () => {
      active = false;
    };
  }, [tab, page, id, key, onExpired]);
  return (
    <Panel title="Atualizações, versões e histórico">
      <div className="form-body space-y-4">
        <div className="flex flex-wrap gap-3" aria-label="Registros do projeto">
          {(['updates', 'history', 'versions'] as const).map((t) => (
            <button
              className={tab === t ? 'button-primary' : 'button-secondary'}
              key={t}
              onClick={() => {
                setTab(t);
                setPage(1);
              }}
            >
              {
                {
                  updates: 'Atualizações',
                  history: 'Histórico',
                  versions: 'Versões',
                }[t]
              }
            </button>
          ))}
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {loaded !== key ? (
          <p role="status">Consultando registros…</p>
        ) : (
          <>
            {!data.items.length && <p>Nenhum registro nesta seção.</p>}
            {data.items.map((v, i) => (
              <article
                className="border-b border-slate-200 py-3 space-y-2"
                key={String(v.id ?? v.version ?? i)}
              >
                {tab === 'versions' ? (
                  <button
                    className="text-button"
                    onClick={() => onVersion(Number(v.version))}
                  >
                    Consultar plano v{String(v.version)}
                  </button>
                ) : (
                  <p className="whitespace-pre-wrap break-words">
                    {String(v.content ?? v.summary)}
                  </p>
                )}
                <p className="text-xs text-slate-500">
                  {String(v.author ?? v.actor)} · {date(String(v.createdAt))}
                  {v.correctionOf ? ' · Correção de registro anterior' : ''}
                </p>
                {tab === 'updates' && manager && (
                  <button
                    className="text-button"
                    onClick={() => onCorrect(String(v.id))}
                  >
                    Registrar correção
                  </button>
                )}
              </article>
            ))}
          </>
        )}
        <TicketPagination
          pageSize={20}
          page={page}
          total={data.total}
          busy={loaded !== key}
          onPage={setPage}
        />
      </div>
    </Panel>
  );
}
