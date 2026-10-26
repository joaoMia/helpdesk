import { focusFirstError, scrollToContent } from '../lib/motion';
import { ProgressBar, ProjectProgress } from '../components/project-progress';
import type { ProgressDraft } from '../types/project-demo';
import { ConfirmChange } from '../components/confirm-change';
import { useEffect, useState } from 'react';
import type { DemoProject, ProjectDraft } from '../types/project-demo';
import type { Role } from '../types/demo';
import {
  projectCategories,
  projectCategoryName,
  projectFields,
} from '../forms/project-definitions';
import { validateAnswers } from '../forms/service-definitions';
import {
  ServiceFields,
  ServiceAnswerSummary,
} from '../components/service-fields';
import { projectScope, projectStageLabels } from '../mocks/projects';
import { requesterName } from '../mocks/fixtures';
import { href } from '../navigation/routes';
import { date } from '../lib/presentation';
import { EmptyState, Icon, PageHeading, Panel } from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { Stepper } from '../components/stepper';

export function Projects({
  projects,
  role,
  page,
  id,
  onRequest,
  onProgress,
}: {
  projects: DemoProject[];
  role: Role;
  page: string;
  id?: string;
  onRequest: (draft: ProjectDraft) => void;
  onProgress: (draft: ProgressDraft) => boolean;
}) {
  const [query, setQuery] = useState(''),
    [stage, setStage] = useState(''),
    [category, setCategory] = useState(''),
    [step, setStep] = useState(0),
    [error, setError] = useState(''),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<ProjectDraft>({
    subject: '',
    description: '',
    categoryId: '',
    answers: {},
  });
  const [pendingCategory, setPendingCategory] = useState<string | null>(null);
  useEffect(() => {
    if (page === 'projeto-novo') {
      document.getElementById('page-title')?.focus({ preventScroll: true });
      scrollToContent(document.getElementById('main-content'));
    }
  }, [step, page]);
  const allowed = projectScope(projects, role),
    project = allowed.find((p) => p.id === id);
  const note = (
    <p className="info-note mb-6">
      Prévia de projetos. Estados, aprovação e visibilidade ainda estão em
      validação. Prazo desejado é expectativa; sem SLA ou aprovação automática.
    </p>
  );
  function selectCategory(id: string, confirmed = false) {
    if (
      draft.categoryId &&
      draft.categoryId !== id &&
      (draft.subject ||
        draft.description ||
        Object.keys(draft.answers ?? {}).length) &&
      !confirmed
    ) {
      setPendingCategory(id);
      return;
    }
    setDraft(
      draft.categoryId === id
        ? draft
        : { subject: '', description: '', categoryId: id, answers: {} },
    );
    setErrors({});
    setError('');
    setStep(1);
  }
  if (page === 'projeto-novo')
    return role === 'requester' ? (
      <>
        {pendingCategory && (
          <ConfirmChange
            message="Trocar a categoria descarta os campos preenchidos do projeto. Você pode preservar a proposta atual."
            onCancel={() => setPendingCategory(null)}
            onConfirm={() => {
              selectCategory(pendingCategory, true);
              setPendingCategory(null);
            }}
          />
        )}
        <PageHeading
          eyebrow="PLANEJE O PRÓXIMO PASSO"
          title={
            step === 0
              ? 'O que vamos transformar?'
              : step === 1
                ? 'Conte sua ideia'
                : 'Revise seu projeto'
          }
          description="Uma solicitação bem descrita ajuda a entender a necessidade. Use somente dados fictícios."
        />
        {note}
        <Stepper
          steps={['Categoria', 'Proposta', 'Revisão']}
          current={step}
          onStep={setStep}
        />
        <MotionRegion motionKey={'project-' + step}>
          {step === 0 ? (
            <div className="selection-grid">
              {projectCategories.map((c) => (
                <button
                  key={c.id}
                  className="selection-card"
                  onClick={() => selectCategory(c.id)}
                >
                  <span className="category-symbol">
                    <Icon name="grid" />
                  </span>
                  <h2>{c.name}</h2>
                  <p>{c.description}</p>
                  <span className="selection-meta">
                    Detalhar proposta <Icon name="arrow" />
                  </span>
                </button>
              ))}
            </div>
          ) : step === 1 ? (
            <Panel
              title={projectCategoryName(draft.categoryId)}
              subtitle="Campos complementares são sugestões demonstrativas."
            >
              <form
                noValidate
                className="form-body"
                onSubmit={(e) => {
                  e.preventDefault();
                  const next = validateAnswers(
                    draft.categoryId,
                    draft.answers ?? {},
                    projectFields(draft.categoryId),
                  );
                  setErrors(next);
                  if (
                    !draft.subject.trim() ||
                    !draft.description.trim() ||
                    Object.keys(next).length
                  ) {
                    setError(
                      'Informe assunto e descrição e revise os campos indicados.',
                    );
                    window.requestAnimationFrame(() =>
                      focusFirstError(document.getElementById('main-content')),
                    );
                    return;
                  }
                  setError('');
                  setStep(2);
                  scrollToContent(document.getElementById('main-content'));
                }}
              >
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <label className="form-label">
                  Assunto *
                  <input
                    className="field"
                    required
                    value={draft.subject}
                    maxLength={160}
                    onChange={(e) =>
                      setDraft({ ...draft, subject: e.target.value })
                    }
                  />
                </label>
                <label className="form-label">
                  Descrição detalhada *
                  <textarea
                    className="field min-h-32"
                    required
                    value={draft.description}
                    maxLength={4000}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                </label>
                <ServiceFields
                  serviceId={draft.categoryId}
                  fields={projectFields(draft.categoryId)}
                  answers={draft.answers ?? {}}
                  onChange={(answers) => setDraft({ ...draft, answers })}
                  errors={errors}
                  prefix="project"
                />
                <div className="flex flex-wrap gap-3">
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => setStep(0)}
                  >
                    Voltar à categoria
                  </button>
                  <button className="button-primary" type="submit">
                    Revisar projeto
                  </button>
                </div>
              </form>
            </Panel>
          ) : (
            <div className="space-y-6">
              <Panel
                title={draft.subject}
                subtitle={projectCategoryName(draft.categoryId)}
              >
                <div className="form-body">
                  <p className="whitespace-pre-wrap text-sm leading-7">
                    {draft.description}
                  </p>
                  <ServiceAnswerSummary
                    serviceId={draft.categoryId}
                    fields={projectFields(draft.categoryId)}
                    answers={draft.answers ?? {}}
                  />
                </div>
              </Panel>
              <div className="flex flex-wrap gap-3">
                <button className="button-secondary" onClick={() => setStep(1)}>
                  Voltar e editar
                </button>
                <button
                  className="button-primary"
                  onClick={() => onRequest(draft)}
                >
                  Confirmar solicitação simulada
                </button>
              </div>
            </div>
          )}
        </MotionRegion>
      </>
    ) : (
      <EmptyState title="Solicitação indisponível neste perfil">
        As ações de projetos ainda aguardam definição.
      </EmptyState>
    );
  if (page === 'projeto')
    return project ? (
      <>
        <a className="back-link" href={href(role, 'projetos')}>
          ← Voltar aos projetos
        </a>
        <PageHeading
          eyebrow={`${project.id} · PROJETO DEMONSTRATIVO`}
          title={project.subject}
          description={projectCategoryName(project.categoryId)}
        />
        {note}
        <div className="detail-grid">
          <div className="space-y-6">
            <ProjectProgress
              project={project}
              role={role}
              onUpdate={onProgress}
            />
            <Panel title="Proposta do projeto">
              <div className="form-body">
                <p className="whitespace-pre-wrap text-sm leading-7">
                  {project.description}
                </p>
                <ServiceAnswerSummary
                  serviceId={project.categoryId}
                  fields={projectFields(project.categoryId)}
                  answers={project.answers ?? {}}
                />
              </div>
            </Panel>
            <Panel title="Acompanhamento demonstrativo">
              <ol className="timeline">
                <li>
                  <span className="timeline-dot" />
                  <strong>Solicitação registrada na amostra</strong>
                  <p className="mt-2 text-sm text-slate-500">
                    {date(project.createdAt)} ·{' '}
                    {requesterName(project.requesterId)}
                  </p>
                </li>
                <li>
                  <span className="timeline-dot" />
                  <strong>{projectStageLabels[project.stage]}</strong>
                  <p className="mt-2 text-sm text-slate-500">
                    Próximas etapas e critérios de aprovação aguardam definição.
                    Nenhuma aprovação foi executada.
                  </p>
                </li>
              </ol>
            </Panel>
          </div>
          <Panel title="Visão do projeto">
            <dl className="form-body space-y-5">
              <div>
                <dt className="detail-label">Categoria</dt>
                <dd>{projectCategoryName(project.categoryId)}</dd>
              </div>
              <div>
                <dt className="detail-label">Estado visual</dt>
                <dd className="badge status-open">
                  {projectStageLabels[project.stage]}
                </dd>
              </div>
              <div>
                <dt className="detail-label">Solicitante</dt>
                <dd>{requesterName(project.requesterId)}</dd>
              </div>
            </dl>
          </Panel>
        </div>
      </>
    ) : (
      <EmptyState title="Projeto indisponível nesta visão">
        <a href={href(role, 'projetos')}>Voltar aos projetos</a>
      </EmptyState>
    );
  const rows = allowed.filter(
    (p) =>
      `${p.id} ${p.subject} ${projectCategoryName(p.categoryId)}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR')) &&
      (!stage || p.stage === stage) &&
      (!category || p.categoryId === category),
  );
  return (
    <>
      <PageHeading
        eyebrow="IDEIAS QUE VIRAM POSSIBILIDADES"
        title={role === 'requester' ? 'Meus projetos' : 'Projetos'}
        description="Organize necessidades de tecnologia, descreva benefícios e acompanhe as propostas."
      >
        {role === 'requester' && (
          <a className="button-primary" href={href(role, 'projeto-novo')}>
            <Icon name="plus" />
            Solicitar projeto
          </a>
        )}
      </PageHeading>
      <div className="project-overview">
        <article>
          <span>Projetos na amostra</span>
          <strong>{allowed.length.toString().padStart(2, '0')}</strong>
        </article>
        <article>
          <span>Categorias representadas</span>
          <strong>
            {new Set(allowed.map((p) => p.categoryId)).size
              .toString()
              .padStart(2, '0')}
          </strong>
        </article>
        <article>
          <span>Ciclo de aprovação</span>
          <strong className="text-lg">Em definição</strong>
        </article>
      </div>
      {note}
      <section className="panel">
        <div className="filter-bar">
          <label className="search-field">
            <Icon name="search" />
            <span className="sr-only">Buscar projetos</span>
            <input
              value={query}
              placeholder="Buscar projeto, assunto ou categoria"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Categoria do projeto</span>
            <select
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {projectCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar estado provisório</span>
            <select
              className="field"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="">Todos os estados provisórios</option>
              {Object.entries(projectStageLabels).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          {(query || stage || category) && (
            <button
              className="text-button text-xs"
              onClick={() => {
                setQuery('');
                setStage('');
                setCategory('');
              }}
            >
              Limpar filtros de projetos
            </button>
          )}
        </div>
        {rows.length ? (
          <div className="project-list">
            {rows.map((p) => (
              <a
                key={p.id}
                className="project-card"
                href={href(role, 'projeto/' + p.id)}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="eyebrow">{p.id}</span>
                  <span className="badge status-open">
                    {projectStageLabels[p.stage]}
                  </span>
                </div>
                <h2>{p.subject}</h2>
                <p className="mt-2 text-sm text-slate-500">
                  {projectCategoryName(p.categoryId)}
                </p>
                <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-500">
                  {p.description}
                </p>
                <div className="mt-5 space-y-2">
                  <span className="text-xs font-semibold">
                    Andamento demonstrativo: {p.progress}%
                  </span>
                  <ProgressBar value={p.progress} />
                </div>
                <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    {requesterName(p.requesterId)} · {date(p.createdAt)}
                  </span>
                  <Icon name="arrow" />
                </div>
              </a>
            ))}
          </div>
        ) : (
          <EmptyState title="Nenhum projeto encontrado">
            Altere os filtros ou simule uma nova solicitação.
          </EmptyState>
        )}
      </section>
    </>
  );
}
