import {
  formDefinitionSchema,
  idSchema,
  instantSchema,
  openTicketInputSchema,
  openedTicketSchema,
  serviceSnapshotSchema,
} from '@helpdesk/contracts';
import type { OpenedTicket } from '@helpdesk/contracts';
import { ApplicationError } from '../../shared/errors.js';
import type { OpeningRecord, TicketRepository } from './ticket.repository.js';

// Core use case. HTTP orchestration supplies the authenticated actor and secured
// transaction through TicketApiService; demonstration identity is never accepted.
export class TicketService {
  constructor(private readonly repository: TicketRepository) {}
  async open(actorId: unknown, payload: unknown): Promise<OpenedTicket> {
    const identity = idSchema.safeParse(actorId);
    if (!identity.success)
      throw new ApplicationError(
        'UNAUTHENTICATED',
        401,
        'Identidade autenticada obrigatória.',
      );
    const parsed = openTicketInputSchema.safeParse(payload);
    if (!parsed.success)
      throw new ApplicationError(
        'INVALID_INPUT',
        400,
        'Revise os campos permitidos e obrigatórios da abertura.',
      );
    const input = parsed.data;
    return this.repository.transaction(async (unit) => {
      const actor = await unit.findActor(identity.data);
      if (!actor?.active || actor.role !== 'REQUESTER')
        throw new ApplicationError(
          'FORBIDDEN',
          403,
          'Abertura permitida somente ao solicitante ativo.',
        );
      const service = await unit.findCatalog(input.serviceId);
      if (!service?.active || !service.category.active)
        throw new ApplicationError(
          'SERVICE_UNAVAILABLE',
          409,
          'Serviço indisponível para nova abertura.',
        );
      if (!service.form)
        throw new ApplicationError(
          'FORM_UNAVAILABLE',
          409,
          'Serviço sem formulário versionado disponível.',
        );
      const definitions = formDefinitionSchema.safeParse(service.form.fields);
      if (!definitions.success)
        throw new ApplicationError(
          'FORM_UNAVAILABLE',
          409,
          'Configuração do formulário indisponível.',
        );
      const fields = definitions.data;
      if (fields.some((field) => field.condition))
        throw new ApplicationError(
          'FORM_RULES_PENDING',
          409,
          'Condições de formulário aguardam homologação para uso real.',
        );
      if (
        Object.keys(input.answers).some(
          (key) => !fields.some((field) => field.key === key),
        )
      )
        throw new ApplicationError(
          'INVALID_ANSWERS',
          400,
          'Há respostas sem campo correspondente no formulário.',
        );
      const answers: OpeningRecord['answers'] = [];
      for (const field of fields) {
        const value = input.answers[field.key];
        const empty =
          value === undefined ||
          (typeof value === 'string' && !value.trim()) ||
          (Array.isArray(value) && !value.length);
        if (empty) {
          if (field.required)
            throw new ApplicationError(
              'INVALID_ANSWERS',
              400,
              'Preencha os campos obrigatórios do serviço.',
            );
          continue;
        }
        if (field.type === 'FILE')
          throw new ApplicationError(
            'UPLOAD_PENDING',
            409,
            'Anexos dependem do módulo de upload autenticado.',
          );
        const valid =
          field.type === 'CHECKBOX'
            ? typeof value === 'boolean'
            : field.type === 'MULTI_SELECT'
              ? Array.isArray(value) &&
                new Set(value).size === value.length &&
                value.every((item) => field.options?.includes(item))
              : field.type === 'SELECT'
                ? typeof value === 'string' && !!field.options?.includes(value)
                : field.type === 'DATE_TIME'
                  ? instantSchema.safeParse(value).success
                  : typeof value === 'string';
        if (!valid)
          throw new ApplicationError(
            'INVALID_ANSWERS',
            400,
            'Resposta incompatível com o campo do serviço.',
          );
        answers.push({
          fieldId: field.id,
          fieldKey: field.key,
          value:
            typeof value === 'string'
              ? field.type === 'DATE_TIME'
                ? new Date(value).toISOString()
                : value.trim()
              : value!,
        });
      }
      const snapshot = serviceSnapshotSchema.parse({
        schemaVersion: 1,
        serviceId: service.id,
        serviceName: service.name,
        serviceDescription: service.description,
        categoryId: service.category.id,
        categoryName: service.category.name,
        formVersionId: service.form.id,
        formVersion: service.form.version,
        fields,
      });
      return openedTicketSchema.parse(
        await unit.insertOpening({
          requesterId: actor.id,
          serviceId: service.id,
          formVersionId: service.form.id,
          subject: input.subject,
          description: input.description,
          snapshot,
          answers,
        }),
      );
    });
  }
}
