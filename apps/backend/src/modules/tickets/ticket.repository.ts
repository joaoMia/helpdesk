import type {
  FormField,
  OpenedTicket,
  ServiceSnapshot,
  UserRole,
} from '@helpdesk/contracts';
export interface CatalogEntry {
  id: string;
  name: string;
  description: string;
  active: boolean;
  category: { id: string; name: string; active: boolean };
  form: { id: string; version: number; fields: FormField[] } | null;
}
export interface OpeningRecord {
  requesterId: string;
  subject: string;
  description: string;
  serviceId: string;
  formVersionId: string;
  snapshot: ServiceSnapshot;
  answers: {
    fieldId: string;
    fieldKey: string;
    value: string | string[] | boolean;
  }[];
}
export interface TicketUnit {
  findActor(
    id: string,
  ): Promise<{ id: string; role: UserRole; active: boolean } | null>;
  findCatalog(id: string): Promise<CatalogEntry | null>;
  insertOpening(record: OpeningRecord): Promise<OpenedTicket>;
}
export interface TicketRepository {
  transaction<T>(operation: (unit: TicketUnit) => Promise<T>): Promise<T>;
}
