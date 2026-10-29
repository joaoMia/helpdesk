import { formFieldSchema, openedTicketSchema } from '@helpdesk/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { TicketRepository, TicketUnit } from './ticket.repository.js';
import { ApplicationError } from '../../shared/errors.js';
export function prismaTicketUnit(tx: Prisma.TransactionClient): TicketUnit {
  return {
    async findActor(id) {
      const actor = await tx.user.findUnique({
        where: { id },
        select: { id: true, role: true, isActive: true },
      });
      return actor
        ? { id: actor.id, role: actor.role, active: actor.isActive }
        : null;
    },
    async findCatalog(id) {
      // Serialize catalog edits/transfer with this internal opening. In a
      // serializable transaction a stale concurrent edit aborts, never opens
      // against an unchecked category/service or races the transfer guard.
      await tx.$queryRaw`SELECT c.id FROM service_categories c JOIN services s ON s.category_id=c.id WHERE s.id=${id}::uuid FOR SHARE OF c`;
      await tx.$queryRaw`SELECT id FROM services WHERE id=${id}::uuid FOR SHARE`;
      const service = await tx.service.findUnique({
        where: { id },
        include: {
          category: true,
          forms: {
            orderBy: { version: 'desc' },
            take: 1,
            include: { fields: { orderBy: { displayOrder: 'asc' } } },
          },
        },
      });
      if (!service) return null;
      const form = service.forms[0];
      return {
        id: service.id,
        name: service.name,
        description: service.description,
        active: service.isActive,
        category: {
          id: service.category.id,
          name: service.category.name,
          active: service.category.isActive,
        },
        form: form
          ? {
              id: form.id,
              version: form.version,
              fields: form.fields.map((field) => {
                const parsed = formFieldSchema.safeParse({
                  id: field.id,
                  key: field.key,
                  label: field.label,
                  type: field.type,
                  required: field.required,
                  ...(field.options !== null ? { options: field.options } : {}),
                  ...(field.condition !== null
                    ? { condition: field.condition }
                    : {}),
                });
                if (!parsed.success)
                  throw new ApplicationError(
                    'FORM_UNAVAILABLE',
                    409,
                    'Configuração do formulário indisponível.',
                  );
                return parsed.data;
              }),
            }
          : null,
      };
    },
    async insertOpening(record) {
      const ticket = await tx.ticket.create({
        data: {
          requesterId: record.requesterId,
          subject: record.subject,
          description: record.description,
          serviceId: record.serviceId,
          formVersionId: record.formVersionId,
          status: 'OPEN',
          priority: null,
          assignedTechnicianId: null,
          serviceSnapshot: record.snapshot as Prisma.InputJsonValue,
          answers: {
            create: record.answers.map((answer) => ({
              fieldId: answer.fieldId,
              fieldKey: answer.fieldKey,
              value: answer.value,
            })),
          },
          events: {
            create: {
              actorId: record.requesterId,
              eventType: 'OPENED',
              newValue: {
                status: 'OPEN',
                priority: null,
                assignedTechnicianId: null,
                serviceId: record.serviceId,
                formVersionId: record.formVersionId,
              },
            },
          },
        },
        select: {
          id: true,
          code: true,
          status: true,
          priority: true,
          assignedTechnicianId: true,
          createdAt: true,
          serviceSnapshot: true,
        },
      });
      return openedTicketSchema.parse({
        ...ticket,
        createdAt: ticket.createdAt.toISOString(),
      });
    },
  };
}
export function prismaTicketRepository(client: PrismaClient): TicketRepository {
  return {
    transaction: (operation) =>
      client.$transaction((tx) => operation(prismaTicketUnit(tx)), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      }),
  };
}
