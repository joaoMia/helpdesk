import {
  createTicketHttpSchema,
  ticketQuerySchema,
  ticketHistoryQuerySchema,
  idSchema,
  ticketSummarySchema,
  ticketDetailSchema,
  serviceSnapshotSchema,
  ticketListSchema,
  ticketHistorySchema,
  triageQuerySchema,
  triageListSchema,
  triageTicketSchema,
  classifyPrioritySchema,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import {
  requirePermission,
  resourceNotFound,
} from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import {
  TicketApiRepository,
  triageConflict,
} from './ticket-api.repository.js';
import { TicketService } from './ticket.service.js';
const invalid = () =>
  new ApplicationError(
    'INVALID_INPUT',
    400,
    'Revise os campos e filtros permitidos do chamado.',
  );
type SummaryRow = Awaited<
  ReturnType<TicketApiRepository['list']>
>['items'][number];
function summary(row: SummaryRow) {
  const snapshot = serviceSnapshotSchema.parse(row.serviceSnapshot);
  return ticketSummarySchema.parse({
    id: row.id,
    code: row.code,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    assignedTechnicianId: row.assignedTechnicianId,
    serviceId: row.serviceId,
    serviceName: snapshot.serviceName,
    categoryName: snapshot.categoryName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
function resourceId(input: unknown) {
  const id = idSchema.safeParse(input);
  if (!id.success) throw resourceNotFound();
  return id.data;
}
export class TicketApiService {
  constructor(private repo: TicketApiRepository) {}
  async triage(identity: Identity, input: unknown) {
    requirePermission(identity, 'tickets.triage');
    const parsed = triageQuerySchema.safeParse(input);
    if (!parsed.success) throw invalid();
    const result = await this.repo.triage(identity, parsed.data);
    return triageListSchema.parse({
      ...result,
      items: result.items.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }
  async classify(identity: Identity, id: unknown, input: unknown) {
    requirePermission(identity, 'tickets.classify');
    const parsed = classifyPrioritySchema.safeParse(input);
    if (!parsed.success) throw invalid();
    try {
      const row = await this.repo.classify(
        identity,
        resourceId(id),
        parsed.data,
      );
      return triageTicketSchema.parse({
        ...row,
        createdAt: row.createdAt.toISOString(),
      });
    } catch (error) {
      if (
        (error as { code?: string })?.code === 'P2034' ||
        ['40001', '40P01'].includes(databaseErrorCode(error) ?? '')
      )
        throw triageConflict();
      throw error;
    }
  }
  async open(identity: Identity, input: unknown) {
    requirePermission(identity, 'tickets.create');
    const parsed = createTicketHttpSchema.safeParse(input);
    if (!parsed.success) throw invalid();
    try {
      return await new TicketService({
        transaction: (op) => this.repo.openingTransaction(identity, op),
      }).open(identity.user.id, parsed.data);
    } catch (error) {
      if (
        (error as { code?: string })?.code === 'P2034' ||
        ['40001', '40P01'].includes(databaseErrorCode(error) ?? '')
      )
        throw new ApplicationError(
          'TICKET_CONFLICT',
          409,
          'O catálogo ou sua sessão mudou. Atualize os dados antes de tentar novamente.',
        );
      throw error;
    }
  }
  async list(identity: Identity, input: unknown) {
    requirePermission(identity, 'tickets.read');
    const parsed = ticketQuerySchema.safeParse(input);
    if (!parsed.success) throw invalid();
    const result = await this.repo.list(identity, parsed.data);
    return ticketListSchema.parse({
      ...result,
      items: result.items.map(summary),
    });
  }
  async detail(identity: Identity, input: unknown) {
    requirePermission(identity, 'tickets.read');
    const row = await this.repo.detail(identity, resourceId(input));
    return ticketDetailSchema.parse({
      ...summary(row),
      requesterId: row.requesterId,
      description: row.description,
      formVersionId: row.formVersionId,
      serviceSnapshot: row.serviceSnapshot,
      firstStartedAt: row.firstStartedAt?.toISOString() ?? null,
      closedAt: row.closedAt?.toISOString() ?? null,
      answers: row.answers.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  }
  async history(identity: Identity, id: unknown, input: unknown) {
    requirePermission(identity, 'tickets.read');
    const parsed = ticketHistoryQuerySchema.safeParse(input);
    if (!parsed.success) throw invalid();
    const result = await this.repo.history(
      identity,
      resourceId(id),
      parsed.data,
    );
    return ticketHistorySchema.parse({
      ...result,
      items: result.items.map((e) => ({
        ...e,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  }
}
