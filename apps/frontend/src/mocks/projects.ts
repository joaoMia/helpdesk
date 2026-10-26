import type { ProgressDraft } from '../types/project-demo';
import { projectCategories, projectFields } from '../forms/project-definitions';
import { sanitizeAnswers, validateAnswers } from '../forms/service-definitions';
import type {
  DemoProject,
  ProjectDraft,
  ProjectStage,
} from '../types/project-demo';
import type { Role } from '../types/demo';
export const projectStageLabels: Record<ProjectStage, string> = {
  REQUESTED_PREVIEW: 'Solicitação recebida · provisório',
  STUDY_PREVIEW: 'Em estudo · provisório',
};
export function initialProjects(): DemoProject[] {
  return [
    {
      id: 'PR-2001',
      progress: 0,
      progressHistory: [],
      categoryId: 'software',
      answers: {
        objective: 'Organizar treinamentos internos',
        department: 'Setor demonstrativo',
      },
      subject: 'Organização da sala de treinamento',
      description:
        'Exemplo fictício de uma necessidade que pode exigir planejamento. Não representa uma aprovação de projeto.',
      requesterId: 'r1',
      createdAt: '2026-10-24T12:00:00Z',
      stage: 'REQUESTED_PREVIEW',
    },
    {
      id: 'PR-2002',
      progress: 45,
      progressHistory: [
        {
          id: 'pg-initial',
          from: 0,
          to: 45,
          at: '2026-10-24T15:00:00Z',
          by: 'Beatriz Lima (fictícia)',
          note: 'Levantamento inicial demonstrativo.',
        },
      ],
      categoryId: 'network',
      answers: { location: 'Unidade demonstrativa', equipment: '12' },
      subject: 'Revisão dos pontos de rede',
      description:
        'Exemplo fictício para avaliar a visualização de projetos. Escopo e ciclo de vida ainda não homologados.',
      requesterId: 'r2',
      createdAt: '2026-10-23T12:00:00Z',
      stage: 'STUDY_PREVIEW',
    },
    {
      id: 'PR-2003',
      categoryId: 'software',
      subject: 'Desenvolvimento do Portal de Chamados',
      description:
        'Exemplo fictício para avaliar progresso manual. Percentual não representa aprovação ou promessa de entrega.',
      requesterId: 'r1',
      createdAt: '2026-09-12T12:00:00Z',
      stage: 'STUDY_PREVIEW',
      progress: 90,
      progressHistory: [
        {
          id: 'pg-portal',
          from: 70,
          to: 90,
          at: '2026-10-24T16:00:00Z',
          by: 'Beatriz Lima (fictícia)',
          note: 'Avanço ilustrativo de interface.',
        },
      ],
    },
    {
      id: 'PR-2004',
      categoryId: 'improvement',
      subject: 'Organização de equipamentos de reunião',
      description:
        'Exemplo fictício de percentual completo, independente do ciclo de aprovação.',
      requesterId: 'r2',
      createdAt: '2026-09-10T12:00:00Z',
      stage: 'STUDY_PREVIEW',
      progress: 100,
      progressHistory: [],
    },
  ];
}
export function projectScope(projects: DemoProject[], role: Role) {
  return role === 'requester'
    ? projects.filter((p) => p.requesterId === 'r1')
    : projects;
}
export function requestProject(
  projects: DemoProject[],
  draft: ProjectDraft,
  role: Role,
): DemoProject[] {
  if (
    role !== 'requester' ||
    !draft.subject.trim() ||
    !draft.description.trim() ||
    !projectCategories.some((c) => c.id === draft.categoryId) ||
    Object.keys(
      validateAnswers(
        draft.categoryId,
        draft.answers ?? {},
        projectFields(draft.categoryId),
      ),
    ).length
  )
    return projects;
  const id = `PR-${Math.max(2000, ...projects.map((p) => Number(p.id.slice(3)))) + 1}`;
  return [
    {
      id,
      ...draft,
      answers: sanitizeAnswers(
        draft.categoryId,
        draft.answers ?? {},
        projectFields(draft.categoryId),
      ),
      subject: draft.subject.trim(),
      description: draft.description.trim(),
      requesterId: 'r1',
      createdAt: new Date().toISOString(),
      stage: 'REQUESTED_PREVIEW',
      progress: 0,
      progressHistory: [],
    },
    ...projects,
  ];
}

export function validateProgress(value: number, note: string) {
  if (!Number.isInteger(value) || value < 0 || value > 100)
    return 'Informe um percentual inteiro de 0 a 100.';
  if (!note.trim()) return 'Descreva a atualização do progresso.';
  return '';
}
export function updateProjectProgress(
  projects: DemoProject[],
  draft: ProgressDraft,
  role: Role,
): DemoProject[] {
  if (
    role !== 'admin' ||
    validateProgress(draft.value, draft.note) ||
    !projects.some((p) => p.id === draft.id)
  )
    return projects;
  return projects.map((p) =>
    p.id !== draft.id
      ? p
      : {
          ...p,
          progress: draft.value,
          progressHistory: [
            ...p.progressHistory,
            {
              id: crypto.randomUUID(),
              from: p.progress,
              to: draft.value,
              at: new Date().toISOString(),
              by: 'Beatriz Lima (fictícia)',
              note: draft.note.trim(),
            },
          ],
        },
  );
}
export function projectProgressSummary(projects: DemoProject[]) {
  return {
    total: projects.length,
    active: projects.filter((p) => p.progress < 100).length,
    completed: projects.filter((p) => p.progress === 100).length,
    estimate: projects.length
      ? Math.round(
          projects.reduce((sum, p) => sum + p.progress, 0) / projects.length,
        )
      : null,
    buckets: [
      projects.filter((p) => p.progress === 0).length,
      projects.filter((p) => p.progress > 0 && p.progress < 25).length,
      projects.filter((p) => p.progress >= 25 && p.progress < 50).length,
      projects.filter((p) => p.progress >= 50 && p.progress < 75).length,
      projects.filter((p) => p.progress >= 75 && p.progress < 100).length,
      projects.filter((p) => p.progress === 100).length,
    ],
  };
}
