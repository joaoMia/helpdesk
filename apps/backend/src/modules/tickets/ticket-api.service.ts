import { z } from 'zod';
import { AdministrationRepository } from '../administration/administration.repository.js';
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
  triageContextTicketSchema,
  classifyPrioritySchema,
  startTicketInputSchema,
  startedTicketSchema,
  overviewQuerySchema,
  overviewListSchema,
  assigneeQuerySchema,
  assigneeListSchema,
  assignTicketInputSchema,
  assignedTicketSchema,
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
  startConflict,
} from './ticket-api.repository.js';
import { TicketService } from './ticket.service.js';
import { OpeningUploadService } from './opening-upload.service.js';
import { OpeningUploadRepository } from './opening-upload.repository.js';
import type { AttachmentStorage } from './attachment-storage.js';
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
  readonly uploads: OpeningUploadService;
  constructor(
    private repo: TicketApiRepository,
    storage?: AttachmentStorage,
  ) {
    this.uploads = new OpeningUploadService(
      new OpeningUploadRepository(repo.db),
      storage,
    );
  }
  async retire(identity: Identity, id: unknown, input: unknown) {
    requirePermission(identity, 'tickets.retire');
    const v = z
      .strictObject({ reason: z.string().trim().min(3).max(1000) })
      .safeParse(input);
    if (!v.success) throw invalid();
    try {
      return await new AdministrationRepository(this.repo.db).retire(
        identity,
        'ticket',
        resourceId(id),
        v.data.reason,
      );
    } catch (e) {
      if (
        (e as { code?: string }).code === 'P2002' ||
        (e as { code?: string }).code === 'P2034'
      )
        throw new ApplicationError(
          'TICKET_CONFLICT',
          409,
          'O registro já foi retirado ou mudou. Atualize a lista.',
        );
      throw e;
    }
  }
  async operational(identity: Identity, id: unknown, query: unknown) {
    requirePermission(identity, 'tickets.overview');
    if (!query || typeof query !== 'object' || Object.keys(query).length)
      throw invalid();
    const result = await this.repo.overview(identity, {
      ...overviewQuerySchema.parse({}),
      pageSize: 1,
      id: resourceId(id),
    });
    const row = result.items[0];
    if (!row) throw resourceNotFound();
    return overviewListSchema.shape.items.element.parse({
      ...row,
      createdAt: row.createdAt.toISOString(),
    });
  }
  async overview(identity: Identity, input: unknown) {
    requirePermission(identity, 'tickets.overview');
    const parsed = overviewQuerySchema.safeParse(input);
    if (!parsed.success) throw invalid();
    const result = await this.repo.overview(identity, parsed.data);
    return overviewListSchema.parse({
      ...result,
      items: result.items.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }
  async assignees(identity: Identity, input: unknown) {
    requirePermission(identity, 'tickets.assignment-candidates');
    const parsed = assigneeQuerySchema.safeParse(input);
    if (!parsed.success) throw invalid();
    return assigneeListSchema.parse(
      await this.repo.assignees(identity, parsed.data),
    );
  }

  async triageDetail(identity: Identity, id: unknown) {
    requirePermission(identity, 'tickets.triage');
    const row = await this.repo.triageDetail(identity, resourceId(id));
    const snapshot = serviceSnapshotSchema.parse(row.serviceSnapshot);
    const org = row.organizationSnapshot as {
      companyName?: string;
      departmentName?: string;
    } | null;
    return triageContextTicketSchema.parse({
      id: row.id,
      code: row.code,
      status: row.status,
      priority: row.priority,
      categoryName: snapshot.categoryName,
      serviceName: snapshot.serviceName,
      requesterName: row.requester.name,
      companyName: org?.companyName ?? null,
      departmentName: org?.departmentName ?? null,
      createdAt: row.createdAt.toISOString(),
    });
  }
  async assign(identity: Identity, id: unknown, input: unknown) {
    requirePermission(identity, 'tickets.assign');
    const parsed = assignTicketInputSchema.safeParse(input);
    if (!parsed.success) throw invalid();
    try {
      return assignedTicketSchema.parse(
        await this.repo.assign(identity, resourceId(id), parsed.data),
      );
    } catch (error) {
      if (
        (error as { code?: string })?.code === 'P2034' ||
        ['40001', '40P01'].includes(databaseErrorCode(error) ?? '')
      )
        throw startConflict();
      throw error;
    }
  }
  async start(identity: Identity, id: unknown, input: unknown) {
    requirePermission(identity, 'tickets.start');
    if (!startTicketInputSchema.safeParse(input).success) throw invalid();
    try {
      const row = await this.repo.start(identity, resourceId(id));
      return startedTicketSchema.parse({
        ...row,
        firstStartedAt: row.firstStartedAt?.toISOString(),
      });
    } catch (error) {
      if (
        (error as { code?: string })?.code === 'P2034' ||
        ['40001', '40P01'].includes(databaseErrorCode(error) ?? '')
      )
        throw startConflict();
      throw error;
    }
  }
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
      requesterName: row.requester.name,
      responsibleName: row.assignedTechnician?.name ?? null,
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
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
      items: result.items.map((e) => {
        const value =
          e.newValue &&
          typeof e.newValue === 'object' &&
          !Array.isArray(e.newValue)
            ? e.newValue
            : {};
        return {
          id: e.id,
          actorId: e.actorId,
          eventType: e.eventType,
          createdAt: e.createdAt.toISOString(),
          actorName:
            typeof value.actorName === 'string'
              ? value.actorName
              : (e.actor?.name ?? null),
          responsibleName:
            e.eventType === 'ASSIGNED' &&
            typeof value.assignedTechnicianName === 'string'
              ? value.assignedTechnicianName
              : null,
        };
      }),
    });
  }
}
