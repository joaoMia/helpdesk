// Estados meramente visuais, sem equivalência com o ciclo de chamados.
export type ProjectStage = 'REQUESTED_PREVIEW' | 'STUDY_PREVIEW';
export interface ProgressUpdate {
  id: string;
  from: number;
  to: number;
  at: string;
  by: string;
  note: string;
}
export interface ProgressDraft {
  id: string;
  value: number;
  note: string;
}
export interface DemoProject {
  id: string;
  subject: string;
  description: string;
  requesterId: string;
  createdAt: string;
  progress: number;
  progressHistory: ProgressUpdate[];
  stage: ProjectStage;
  categoryId: string;
  answers?: import('../forms/service-definitions').ServiceAnswers;
}
export interface ProjectDraft {
  subject: string;
  description: string;
  categoryId: string;
  answers?: import('../forms/service-definitions').ServiceAnswers;
}
