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
import { TicketPagination } from '../components/ticket-pagination';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { date } from '../lib/presentation';
import { ProjectDashboard } from './project-dashboard';
import { DynamicServiceFields } from '../components/dynamic-service-fields';
import { OpeningFileField } from '../components/opening-file-field';
import { ProjectOpening } from '../components/project-opening';
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
type Action = { op: string; activityId?: string };
type ProjectSection = 'plan' | 'history';
const sidebarViewport = '(min-width: 1024px) and (min-height: 640px)';

export function ProjectDetailActions({
  workflow: w,
  user,
  busy,
  onEdit,
  onAction,
  onSection,
  onRefresh,
}: {
  workflow: ProjectWorkflow;
  user: Pick<PublicUser, 'id' | 'role'>;
  busy: boolean;
  onEdit: () => void;
  onAction: (action: Action) => void;
  onSection: (section: ProjectSection) => void;
  onRefresh: () => void;
}) {
  const canEdit =
    w.permissions.manage &&
    (w.state === 'PLANNING' ||
      w.state === 'IN_PROGRESS' ||
      (w.state === 'REQUESTED' && !!w.owner && w.permissions.publish));
  const canStart = w.permissions.execute && w.state === 'PLANNING' && !!w.plan;
  const canOperateProject =
    user.role === 'ADMIN' ||
    (user.role === 'TECHNICIAN' && w.owner?.id === user.id);
  const canComplete =
    canOperateProject && w.permissions.execute && w.state === 'IN_PROGRESS';
  const canTransitionExecution = canStart || canComplete;
  const canManageStages = w.permissions.execute && w.state === 'IN_PROGRESS';
  const canDiscard = w.permissions.manage && !!w.draft;
  const hasPrimary = canEdit || canStart || canComplete || w.permissions.assign;
  const planLabel = !w.plan
    ? 'Planejamento'
    : canManageStages
      ? 'Gerenciar etapas'
      : 'Consultar planejamento';
  return (
    <>
      {hasPrimary && (
        <div
          className="ticket-operational-actions"
          role="group"
          aria-label="Ações principais"
        >
          {canStart && (
            <button
              className="button-primary"
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
          {canEdit && (
            <button
              className={
                canTransitionExecution
                  ? w.permissions.assign
                    ? 'button-secondary'
                    : 'button-secondary col-span-full'
                  : 'button-primary'
              }
              disabled={busy}
              onClick={onEdit}
            >
              {w.draft || w.plan ? 'Editar plano' : 'Criar plano'}
            </button>
          )}
          {w.permissions.assign && (
            <button
              className={
                w.state === 'REQUESTED' && !w.owner
                  ? 'button-primary'
                  : canEdit && canTransitionExecution
                    ? 'button-secondary'
                    : 'button-secondary col-span-full'
              }
              disabled={busy}
              onClick={() => onAction({ op: 'assignment' })}
            >
              Definir responsável
            </button>
          )}
        </div>
      )}
      <div
        className="ticket-info-links"
        role="group"
        aria-label="Acompanhamento do projeto"
      >
        <button
          className="button-secondary"
          aria-haspopup="dialog"
          onClick={() => onSection('plan')}
        >
          {planLabel}
        </button>
        <button
          className="button-secondary"
          aria-haspopup="dialog"
          onClick={() => onSection('history')}
        >
          Histórico
        </button>
        {w.permissions.setPriority && (
          <button
            className="button-secondary"
            disabled={busy}
            onClick={() => onAction({ op: 'priority' })}
          >
            Alterar prioridade
          </button>
        )}
        <button
          className={
            w.permissions.setPriority
              ? 'button-secondary'
              : 'button-secondary col-span-full'
          }
          onClick={onRefresh}
        >
          Atualizar consulta
        </button>
        {canDiscard && (
          <button
            className={
              w.permissions.cancel
                ? 'button-secondary'
                : 'button-secondary col-span-full'
            }
            disabled={busy}
            onClick={() => onAction({ op: 'draft-delete' })}
          >
            Descartar rascunho
          </button>
        )}
        {w.permissions.cancel && (
          <button
            className={
              canDiscard ? 'button-secondary' : 'button-secondary col-span-full'
            }
            onClick={() => onAction({ op: 'cancel' })}
          >
            Cancelar projeto
          </button>
        )}
        {canOperateProject && w.permissions.retire && (
          <button
            className="button-secondary col-span-full"
            disabled={busy}
            onClick={() => onAction({ op: 'retire' })}
          >
            <Icon name="trash" /> Excluir projeto
          </button>
        )}
      </div>
    </>
  );
}

export function ProjectSummary({ workflow: w }: { workflow: ProjectWorkflow }) {
  const dates = [
    ['Data da solicitação', w.createdAt],
    ['Data de início', w.startedAt],
    ['Data de conclusão', w.completedAt],
    ['Data de cancelamento', w.canceledAt],
  ];
  return (
    <>
      <dl className="ticket-info-people">
        <div>
          <dt>Status e prioridade</dt>
          <dd className="flex flex-wrap gap-1.5">
            <Badge state={w.state} />
            <ProjectPriority priority={w.priority} />
          </dd>
        </div>
        <div>
          <dt>Solicitante</dt>
          <dd>{w.requesterName ?? 'Não informado'}</dd>
        </div>
        <div>
          <dt>Responsável técnico</dt>
          <dd>{w.owner?.name ?? 'Sem responsável'}</dd>
        </div>
      </dl>
      <dl className="ticket-date-summary">
        {dates.map(
          ([label, value]) =>
            value && (
              <div className="ticket-date-highlight" key={label}>
                <dt>{label}</dt>
                <dd>
                  <time dateTime={value}>{date(value)}</time>
                </dd>
              </div>
            ),
        )}
      </dl>
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
        <p className="text-sm text-slate-600">Ainda sem plano</p>
      )}
      <p className="text-xs text-slate-500">Revisão {w.revision}</p>
    </>
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
    [section, setSection] = useState<ProjectSection | null>(null),
    [infoOpen, setInfoOpen] = useState(false),
    [sidebar, setSidebar] = useState(
      () =>
        typeof window !== 'undefined' &&
        window.matchMedia(sidebarViewport).matches,
    ),
    [activityState, setActivityState] = useState('TODO');
  const lock = useRef(false),
    alive = useRef(true),
    pending = useRef<{ signature: string; body: object } | null>(null);
  useEffect(() => {
    const query = window.matchMedia(sidebarViewport);
    const update = () => {
      setSidebar(query.matches);
      if (query.matches) setInfoOpen(false);
    };
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
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
      const updated = await authClient.projectWrite(
        id,
        op,
        pending.current.body,
        method,
      );
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
        if (op === 'assignment') setW(updated);
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
        setW(saved);
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
    'plan-publication': 'Publicar plano',
    start: 'Iniciar execução',
    complete: 'Concluir projeto',
    cancel: 'Cancelar projeto',
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
  const information = w && (
    <div className="ticket-info-content">
      <ProjectSummary workflow={w} />
      <ProjectDetailActions
        workflow={w}
        user={user}
        busy={busy}
        onEdit={() => {
          pending.current = null;
          setError('');
          setEditor(true);
        }}
        onAction={open}
        onSection={(section) => {
          setError('');
          setSection(section);
        }}
        onRefresh={() => setRevision((v) => v + 1)}
      />
    </div>
  );
  return (
    <div className="ticket-detail project-detail">
      <header className="ticket-detail-header">
        <a className="back-link" href={'#/' + projectArea(user) + '/projetos'}>
          ← Voltar aos projetos
        </a>
        {w ? (
          <>
            <div className="ticket-detail-heading">
              <span className="ticket-detail-code">PR-{w.code}</span>
              <h1 id="page-title" tabIndex={-1} title={w.title}>
                {w.title}
              </h1>
            </div>
            <div className="ticket-detail-header-controls">
              <div className="ticket-header-badges flex flex-wrap gap-1.5">
                <Badge state={w.state} />
                {w.priority && <ProjectPriority priority={w.priority} />}
              </div>
              {!sidebar && (
                <button
                  type="button"
                  className="button-secondary ticket-info-trigger"
                  aria-label="Informações do projeto"
                  aria-haspopup="dialog"
                  onClick={() => setInfoOpen(true)}
                >
                  <Icon name="chevron" />
                  <span>
                    Informações
                    <span className="max-[359px]:sr-only"> do projeto</span>
                  </span>
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="ticket-detail-heading">
            <h1 id="page-title" tabIndex={-1}>
              {error ? 'Projeto indisponível' : 'Consultando projeto'}
            </h1>
          </div>
        )}
      </header>
      {error && (!w || (!action && !editor && !section)) && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="ticket-created-note" role="status">
          {notice}
        </p>
      )}
      {!w && !error && (
        <p role="status" className="panel p-4">
          Carregando projeto…
        </p>
      )}
      {w && (
        <div
          className={
            sidebar
              ? 'ticket-detail-grid ticket-detail-with-sidebar'
              : 'ticket-detail-grid'
          }
        >
          <div className="ticket-detail-conversation">
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
              projectOpening={
                <ProjectOpening workflow={w} onExpired={onExpired} />
              }
            />
          </div>
          {sidebar ? (
            <aside
              className="panel ticket-info-panel"
              aria-labelledby="project-info-title"
              tabIndex={0}
            >
              <h2 id="project-info-title">Informações do projeto</h2>
              {information}
            </aside>
          ) : (
            infoOpen && (
              <DemoDialog
                title="Informações do projeto"
                eyebrow=""
                className="ticket-info-dialog"
                cancelLabel="Voltar à conversa"
                onCancel={() => setInfoOpen(false)}
              >
                {information}
              </DemoDialog>
            )
          )}
        </div>
      )}
      {section && w && (
        <DemoDialog
          title={section === 'plan' ? 'Planejamento' : 'Histórico'}
          eyebrow=""
          className="ticket-info-dialog"
          cancelLabel="Fechar"
          onCancel={() => {
            setError('');
            setSection(null);
          }}
        >
          {section === 'plan' ? (
            w.plan ? (
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
            )
          ) : (
            <ProjectHistory
              key={id}
              id={id}
              revision={revision}
              onExpired={onExpired}
            />
          )}
          {error && !action && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </DemoDialog>
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
                {action.op === 'complete'
                  ? 'Resumo obrigatório da entrega'
                  : action.op === 'activity'
                    ? 'Justificativa (obrigatória para retrabalho)'
                    : 'Justificativa'}
                <textarea
                  className="field"
                  maxLength={2000}
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
    </div>
  );
}
function ProjectHistory({
  id,
  revision,
  onExpired,
}: {
  id: string;
  revision: number;
  onExpired: () => void;
}) {
  const [page, setPage] = useState(1),
    [data, setData] = useState<Awaited<
      ReturnType<typeof authClient.projectWorkflowHistory>
    > | null>(null),
    [loaded, setLoaded] = useState(''),
    [error, setError] = useState('');
  const key = page + ':' + revision;
  useEffect(() => {
    let active = true;
    authClient
      .projectWorkflowHistory(id, page)
      .then((r) => {
        if (active) {
          setData(r);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setError(failure(e, onExpired));
        }
      })
      .finally(() => {
        if (active) setLoaded(key);
      });
    return () => {
      active = false;
    };
  }, [page, id, key, onExpired]);
  return (
    <div className="space-y-4">
      {loaded === key && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loaded !== key ? (
        <p role="status">Consultando registros…</p>
      ) : (
        <>
          {!error && !data?.items.length && <p>Nenhum registro nesta seção.</p>}
          {data?.items.map((v) => (
            <article
              className="border-b border-slate-200 py-3 space-y-2"
              key={v.id}
            >
              <p className="whitespace-pre-wrap break-words">{v.summary}</p>
              <p className="text-xs text-slate-500">
                {v.actor} · {date(v.createdAt)}
              </p>
            </article>
          ))}
        </>
      )}
      <TicketPagination
        pageSize={20}
        page={page}
        total={data?.total ?? 0}
        busy={loaded !== key}
        onPage={setPage}
      />
    </div>
  );
}
