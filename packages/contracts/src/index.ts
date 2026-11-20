import { z } from 'zod';
import { attachmentNameSchema, attachmentMimeSchema } from './conversation.js';
export * from './auth.js';
export * from './profile.js';
export * from './technician.js';
export * from './catalog.js';
export * from './administration.js';
export * from './conversation.js';
export * from './lifecycle.js';
export * from './form-visibility.js';

export const userRoleSchema = z.enum(['ADMIN', 'TECHNICIAN', 'REQUESTER']);
export const ticketStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'PENDING',
  'RESOLVED',
  'CLOSED',
]);
export const ticketPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const idSchema = z.uuid();
export const instantSchema = z.iso.datetime({ offset: true });
export const fieldTypeSchema = z.enum([
  'TEXT',
  'NUMBER',
  'DATE',
  'EMAIL',
  'URL',
  'LONG_TEXT',
  'SELECT',
  'MULTI_SELECT',
  'DATE_TIME',
  'FILE',
  'CHECKBOX',
  'CHECKBOX_GROUP',
]);
export const formFieldSchema = z.strictObject({
  id: idSchema,
  key: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .refine((key) => !['constructor', 'prototype', '__proto__'].includes(key)),
  label: z.string().trim().min(1).max(200),
  help: z.string().max(1000).optional(),
  description: z.string().max(1000).optional(),
  type: fieldTypeSchema,
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  condition: z
    .strictObject({ field: z.string().min(1), includes: z.string().min(1) })
    .optional(),
});
export const formDefinitionSchema = z
  .array(formFieldSchema)
  .max(50)
  .superRefine((fields, context) => {
    const keys = new Set<string>(),
      ids = new Set<string>();
    fields.forEach((field, index) => {
      if (keys.has(field.key) || ids.has(field.id))
        context.addIssue({
          code: 'custom',
          path: [index],
          message: 'Campos precisam de identificadores distintos.',
        });
      if (
        ['SELECT', 'MULTI_SELECT', 'CHECKBOX_GROUP'].includes(field.type) &&
        (!field.options?.length ||
          new Set(
            field.options.map((option) =>
              option.trim().toLocaleLowerCase('pt-BR'),
            ),
          ).size !== field.options.length)
      )
        context.addIssue({
          code: 'custom',
          path: [index, 'options'],
          message: 'Opções devem existir e ser distintas.',
        });
      if (field.condition && !keys.has(field.condition.field))
        context.addIssue({
          code: 'custom',
          path: [index, 'condition'],
          message: 'Condição deve referenciar um campo anterior.',
        });
      keys.add(field.key);
      ids.add(field.id);
    });
  });
export const answerValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.boolean(),
  z.number().finite(),
]);
export const openTicketInputSchema = z.strictObject({
  subject: z.string().trim().min(1),
  description: z.string().trim().min(1),
  serviceId: idSchema,
  formVersionId: idSchema.optional(),
  answers: z.record(z.string(), answerValueSchema).default({}),
});
export const serviceSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(1),
  serviceId: idSchema,
  serviceName: z.string().min(1),
  serviceDescription: z.string(),
  categoryId: idSchema,
  categoryName: z.string().min(1),
  formVersionId: idSchema,
  formVersion: z.number().int().positive(),
  fields: formDefinitionSchema,
});
export const openedTicketSchema = z.strictObject({
  id: idSchema,
  code: z.number().int().positive(),
  status: z.literal('OPEN'),
  priority: z.null(),
  assignedTechnicianId: z.null(),
  createdAt: z.iso.datetime(),
  serviceSnapshot: serviceSnapshotSchema,
});
export type UserRole = z.infer<typeof userRoleSchema>;
export type FormField = z.infer<typeof formFieldSchema>;
export type OpenTicketInput = z.infer<typeof openTicketInputSchema>;
export type ServiceSnapshot = z.infer<typeof serviceSnapshotSchema>;
export type OpenedTicket = z.infer<typeof openedTicketSchema>;

// BLOCO 01: additive HTTP contracts; the internal opening contract is preserved.
export const createTicketHttpSchema = openTicketInputSchema.extend({
  subject: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000),
});
export const ticketQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(120).default(''),
  status: ticketStatusSchema.optional(),
  priority: z.union([ticketPrioritySchema, z.literal('NONE')]).optional(),
  serviceId: idSchema.optional(),
});
export const ticketHistoryQuerySchema = ticketQuerySchema.pick({
  page: true,
  pageSize: true,
});
export const ticketSummarySchema = z.strictObject({
  id: idSchema,
  code: z.number().int().positive(),
  subject: z.string(),
  status: ticketStatusSchema,
  priority: ticketPrioritySchema.nullable(),
  assignedTechnicianId: idSchema.nullable(),
  serviceId: idSchema,
  serviceName: z.string(),
  categoryName: z.string(),
  createdAt: instantSchema,
  updatedAt: instantSchema,
});
export const ticketDetailSchema = ticketSummarySchema.extend({
  requesterName: z.string().optional(),
  responsibleName: z.string().nullable().optional(),
  resolvedAt: instantSchema.nullable().optional(),
  description: z.string(),
  requesterId: idSchema,
  formVersionId: idSchema,
  serviceSnapshot: serviceSnapshotSchema,
  firstStartedAt: instantSchema.nullable(),
  closedAt: instantSchema.nullable(),
  answers: z.array(
    z.strictObject({
      fieldKey: z.string(),
      value: answerValueSchema,
      createdAt: instantSchema,
    }),
  ),
});
export const ticketHistoryEventSchema = z.strictObject({
  id: idSchema,
  actorId: idSchema.nullable(),
  actorName: z.string().nullable().optional(),
  responsibleName: z.string().nullable().optional(),
  eventType: z.string(),
  createdAt: instantSchema,
});
const ticketPage = {
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
};
export const ticketListSchema = z.strictObject({
  items: z.array(ticketSummarySchema),
  ...ticketPage,
});
export const ticketHistorySchema = z.strictObject({
  items: z.array(ticketHistoryEventSchema),
  ...ticketPage,
});
export type TicketQuery = z.infer<typeof ticketQuerySchema>;
export type TicketSummary = z.infer<typeof ticketSummarySchema>;
export type TicketDetail = z.infer<typeof ticketDetailSchema>;
export type TicketHistory = z.infer<typeof ticketHistorySchema>;
export type CreateTicketHttp = z.infer<typeof createTicketHttpSchema>;

// Operational triage exposes only the approved minimum projection.
export const triageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  queue: z.enum(['UNCLASSIFIED', 'CLASSIFIED', 'ALL']).default('UNCLASSIFIED'),
  search: z
    .string()
    .trim()
    .max(30)
    .regex(/^(?:(?:HD-)?[1-9]\d{0,9})?$/i)
    .refine(
      (value) => !value || Number(value.replace(/^HD-/i, '')) <= 2147483647,
    )
    .default(''),
  priority: ticketPrioritySchema.optional(),
});
export const triageTicketSchema = ticketSummarySchema.pick({
  id: true,
  code: true,
  status: true,
  priority: true,
  createdAt: true,
});
export const operationalContextSchema = z.object({
  categoryName: z.string().nullable().optional(),
  serviceName: z.string().nullable().optional(),
  requesterName: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  departmentName: z.string().nullable().optional(),
});
export const triageContextTicketSchema = triageTicketSchema.extend(
  operationalContextSchema.shape,
);
export const triageListSchema = z.strictObject({
  items: z.array(triageContextTicketSchema),
  ...ticketPage,
});
export const classifyPrioritySchema = z.strictObject({
  priority: ticketPrioritySchema,
  expectedPriority: ticketPrioritySchema.nullable(),
});
export type TriageQuery = z.infer<typeof triageQuerySchema>;
export type TriageTicket = z.infer<typeof triageContextTicketSchema>;
export type ClassifyPriority = z.infer<typeof classifyPrioritySchema>;

// Starting has no client-controlled assignment, time, priority or target state.
export const startTicketInputSchema = z.strictObject({}).default({});
export const startedTicketSchema = z.strictObject({
  id: idSchema,
  code: z.number().int().positive(),
  status: z.literal('IN_PROGRESS'),
  priority: ticketPrioritySchema,
  assignedTechnicianId: idSchema,
  firstStartedAt: instantSchema,
});
export type StartedTicket = z.infer<typeof startedTicketSchema>;

// BLOCO 03.1: operational metadata only; never a grant to full ticket details.
export const overviewQuerySchema = ticketQuerySchema.omit({ serviceId: true });
export const operationalTicketSchema = triageContextTicketSchema.extend({
  responsibleName: z.string().nullable(),
  canRetire: z.boolean().optional(),
});
export const overviewListSchema = z.strictObject({
  items: z.array(operationalTicketSchema),
  ...ticketPage,
});
export const assigneeQuerySchema = ticketHistoryQuerySchema.extend({
  search: z.string().trim().max(120).default(''),
});
export const assigneeListSchema = z.strictObject({
  items: z.array(z.strictObject({ id: idSchema, name: z.string() })),
  ...ticketPage,
});
// Proposed write contract only. No route or permission enables assignment yet.
export const proposedAssignmentInputSchema = z.strictObject({
  technicianId: idSchema,
  expectedUpdatedAt: instantSchema,
});
export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
export type OperationalTicket = z.infer<typeof operationalTicketSchema>;
export type AssigneeQuery = z.infer<typeof assigneeQuerySchema>;

export const assignTicketInputSchema = z.strictObject({
  technicianId: idSchema,
  expectedPriority: ticketPrioritySchema,
});
export const assignedTicketSchema = startedTicketSchema.extend({
  status: z.literal('OPEN'),
  firstStartedAt: z.null(),
});
export type AssignTicketInput = z.infer<typeof assignTicketInputSchema>;

export const editableFormSchema = z.strictObject({
  title: z.string().trim().max(200),
  description: z.string().max(2000),
  fields: formDefinitionSchema,
});
export const saveFormDraftSchema = z.strictObject({
  expectedRevision: z.number().int().nonnegative(),
  definition: editableFormSchema,
});
export const projectCategoryInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  description: z.string().max(2000).default(''),
  isActive: z.boolean(),
  expectedRevision: z.number().int().positive().optional(),
});
export const projectCategorySchema = z.strictObject({
  id: idSchema,
  name: z.string(),
  description: z.string(),
  isActive: z.boolean(),
  revision: z.number().int().positive(),
});
export const projectCategoriesSchema = z.array(projectCategorySchema);
export const projectAttachmentSchema = z.strictObject({
  id: idSchema,
  name: attachmentNameSchema,
  mime: attachmentMimeSchema,
  size: z.number().int().positive(),
  fieldKey: z.string(),
  fieldLabel: z.string().optional(),
  createdAt: instantSchema,
});
export const projectAttachmentsSchema = z.strictObject({
  items: z.array(projectAttachmentSchema),
});
export const projectSubmissionSchema = z
  .strictObject({
    categoryId: idSchema,
    versionId: idSchema,
    snapshot: editableFormSchema.extend({
      categoryName: z.string(),
      version: z.number().int().positive(),
    }),
    answers: z.record(z.string(), answerValueSchema),
  })
  .nullable();
export const publishFormDraftSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
});

export const publishedFormSchema = editableFormSchema.extend({
  id: idSchema,
  version: z.number().int().positive(),
  createdAt: instantSchema,
});
export const serviceFormSchema = z.strictObject({
  published: publishedFormSchema.nullable(),
  draft: z
    .strictObject({
      revision: z.number().int().positive(),
      published: z.boolean().optional(),
      definition: editableFormSchema,
    })
    .nullable()
    .optional(),
  versions: z
    .array(
      z.strictObject({
        id: idSchema,
        version: z.number(),
        title: z.string(),
        createdAt: instantSchema,
      }),
    )
    .optional(),
});
export type EditableForm = z.infer<typeof editableFormSchema>;
export type ServiceForm = z.infer<typeof serviceFormSchema>;
export const openingUploadSchema = z.strictObject({
  id: idSchema,
  name: z.string().min(1).max(240),
  mime: attachmentMimeSchema,
  size: z.number().int().positive().max(10485760),
  expiresAt: instantSchema,
});
export type OpeningUpload = z.infer<typeof openingUploadSchema>;

export * from './personal-dashboard.js';

export * from './projects.js';

export * from './project-workflow.js';
