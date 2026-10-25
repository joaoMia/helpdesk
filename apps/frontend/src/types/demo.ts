// Tipos exclusivos da prévia. Não são contratos da API nem modelos de domínio.
export type Role = 'requester' | 'technician' | 'admin';
export type Status = 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'CLOSED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';
export interface DemoService {
  id: string;
  name: string;
  description: string;
  cents: number;
  active: boolean;
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
  services: DemoService[];
  attachment: string | null;
  pending: DemoReason | null;
  events: DemoEvent[];
}
export type DemoAction =
  | {
      type: 'create';
      subject: string;
      description: string;
      services: DemoService[];
      attachment: string | null;
    }
  | { type: 'classify'; id: string; priority: Priority }
  | { type: 'start' | 'resume' | 'close'; id: string }
  | { type: 'pending'; id: string; reason: DemoReason; explanation: string }
  | { type: 'comment'; id: string; text: string };
