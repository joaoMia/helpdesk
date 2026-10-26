// Tipos exclusivos da prévia. Não são contratos da API nem modelos de domínio.
export type Role = 'requester' | 'technician' | 'admin';
export type Status = 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'CLOSED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export interface DemoCategory {
  id: string;
  name: string;
  description: string;
  active: boolean;
  order: number;
}
export interface DemoService {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  active: boolean;
  order: number;
  fields: import('../forms/service-definitions').ServiceField[];
}
export interface DemoCatalog {
  categories: DemoCategory[];
  services: DemoService[];
}
export interface DemoReason {
  id: string;
  name: string;
  counts: boolean;
  autoResume: boolean;
}
export interface DemoEvent {
  id: string;
  actor: string;
  text: string;
  at: string;
}
export interface DemoTicket {
  id: string;
  subject: string;
  description: string;
  requesterId: string;
  status: Status;
  priority: Priority | null;
  technicianId: string | null;
  createdAt: string;
  service: DemoService;
  category: DemoCategory;
  answers: import('../forms/service-definitions').ServiceAnswers;
  legacyServices?: DemoService[];
  attachment: string | null;
  pending: DemoReason | null;
  events: DemoEvent[];
  serviceAnswers?: import('../forms/service-definitions').AnswersByService;
  externalTotvs?: string;
  firstStartedAt?: string;
  closedAt?: string;
  closedBy?: string;
  effectiveCompletedAt?: string;
  completionRecordedAt?: string;
  completionJustification?: string;
  completionCorrections?: import('../mocks/completion').CompletionCorrection[];
}
export type DemoAction =
  | {
      type: 'create';
      subject: string;
      description: string;
      service: DemoService;
      category: DemoCategory;
      answers: import('../forms/service-definitions').ServiceAnswers;
      attachment: string | null;
      serviceAnswers?: import('../forms/service-definitions').AnswersByService;
    }
  | { type: 'classify'; id: string; priority: Priority }
  | { type: 'start' | 'resume'; id: string }
  | { type: 'close'; id: string; effectiveAt?: string; justification?: string }
  | {
      type: 'request-completion-correction';
      id: string;
      effectiveAt: string;
      justification: string;
    }
  | { type: 'pending'; id: string; reason: DemoReason; explanation: string }
  | { type: 'comment'; id: string; text: string }
  | { type: 'external-totvs'; id: string; value: string };
