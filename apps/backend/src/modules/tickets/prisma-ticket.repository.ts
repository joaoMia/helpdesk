import { formFieldSchema, openedTicketSchema } from '@helpdesk/contracts';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { TicketRepository, TicketUnit } from './ticket.repository.js';
import { ApplicationError } from '../../shared/errors.js';
import { applicableSchedule } from '../calendars/calendar-segments.js';
export function prismaTicketUnit(tx: Prisma.TransactionClient): TicketUnit {
  return {
    supportsOpeningFiles: true,
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
      const service = await tx.service.findFirst({
        where: {
          id,
          retirement: { is: null },
          category: { retirement: { is: null } },
        },
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
                  help: field.help,
                  description: field.description,
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
      const fileAnswers = record.answers.filter((a) =>
        record.snapshot.fields.some(
          (f) => f.id === a.fieldId && f.type === 'FILE',
        ),
      );
      const ids = fileAnswers.flatMap((a) => a.value as string[]);
      if (ids.length > 10 || new Set(ids).size !== ids.length)
        throw new ApplicationError(
          'INVALID_ANSWERS',
          400,
          'Limite de dez anexos por abertura; não repita arquivos.',
        );
      const files = [];
      for (const id of [...ids].sort()) {
        await tx.$queryRaw`SELECT id FROM opening_uploads WHERE id=${id}::uuid FOR UPDATE`;
        const f = await tx.openingUpload.findUnique({ where: { id } });
        const answer = fileAnswers.find((a) =>
          (a.value as string[]).includes(id),
        );
        if (
          !f ||
          f.ownerId !== record.requesterId ||
          f.serviceId !== record.serviceId ||
          f.formVersionId !== record.formVersionId ||
          f.fieldId !== answer?.fieldId ||
          f.fieldKey !== answer.fieldKey ||
          f.expiresAt <= new Date()
        )
          throw new ApplicationError(
            'INVALID_UPLOAD',
            409,
            'Anexo ausente, expirado ou incompatível. Envie novamente no campo correspondente.',
          );
        files.push(f);
      }
      const organization = await tx.user.findUnique({
        where: { id: record.requesterId },
        select: {
          companyId: true,
          departmentId: true,
          company: { select: { name: true } },
          department: { select: { name: true } },
        },
      });
      const calendar = await applicableSchedule(tx, record.requesterId, false);
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
          organizationSnapshot: organization?.companyId
            ? {
                schemaVersion: 1,
                companyId: organization.companyId,
                companyName: organization.company?.name ?? null,
                departmentId: organization.departmentId,
                departmentName: organization.department?.name ?? null,
              }
            : Prisma.DbNull,
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
      if (files.length) {
        const comment = await tx.ticketComment.create({
          data: {
            ticketId: ticket.id,
            authorId: record.requesterId,
            content: 'Anexos enviados na abertura do chamado.',
            createdAt: ticket.createdAt,
          },
          select: { id: true },
        });
        await tx.ticketAttachment.createMany({
          data: files.map((f) => ({
            id: f.id,
            ticketId: ticket.id,
            uploaderId: f.ownerId,
            commentId: comment.id,
            name: f.name,
            mime: f.mime,
            size: f.size,
            sha256: f.sha256,
            storageKey: f.storageKey,
            isDraft: false,
          })),
        });
        await tx.openingUpload.deleteMany({ where: { id: { in: ids } } });
      }
      if (calendar)
        await tx.ticketCalendarSegment.create({
          data: {
            ticketId: ticket.id,
            versionId: calendar.id,
            startsAt: ticket.createdAt,
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
