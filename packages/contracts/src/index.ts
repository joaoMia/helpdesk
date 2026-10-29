import { z } from 'zod';
export * from './auth.js';
export * from './profile.js';
export * from './technician.js';
export * from './catalog.js';

export const userRoleSchema = z.enum(['ADMIN', 'TECHNICIAN', 'REQUESTER']);
export const ticketStatusSchema = z.enum([
  'OPEN',
  'IN_PROGRESS',
  'PENDING',
  'CLOSED',
]);
export const ticketPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const idSchema = z.uuid();
export const instantSchema = z.iso.datetime({ offset: true });
export const fieldTypeSchema = z.enum([
  'TEXT',
  'LONG_TEXT',
  'SELECT',
  'MULTI_SELECT',
  'DATE_TIME',
  'FILE',
  'CHECKBOX',
]);
export const formFieldSchema = z.strictObject({
  id: idSchema,
  key: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/)
    .refine((key) => !['constructor', 'prototype', '__proto__'].includes(key)),
  label: z.string().trim().min(1),
  type: fieldTypeSchema,
  required: z.boolean(),
  options: z.array(z.string().min(1)).optional(),
  condition: z
    .strictObject({ field: z.string().min(1), includes: z.string().min(1) })
    .optional(),
});
export const formDefinitionSchema = z
  .array(formFieldSchema)
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
        ['SELECT', 'MULTI_SELECT'].includes(field.type) &&
        (!field.options?.length ||
          new Set(field.options).size !== field.options.length)
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
]);
export const openTicketInputSchema = z.strictObject({
  subject: z.string().trim().min(1),
  description: z.string().trim().min(1),
  serviceId: idSchema,
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
export const createTicketHttpSchema = openTicketInputSchema
  .extend({
    subject: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(4000),
  })
  .refine(
    (v) => Object.keys(v.answers).length === 0,
    'Campos adicionais ainda não estão disponíveis na abertura HTTP.',
  );
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
export const triageListSchema = z.strictObject({
  items: z.array(triageTicketSchema),
  ...ticketPage,
});
export const classifyPrioritySchema = z.strictObject({
  priority: ticketPrioritySchema,
  expectedPriority: ticketPrioritySchema.nullable(),
});
export type TriageQuery = z.infer<typeof triageQuerySchema>;
export type TriageTicket = z.infer<typeof triageTicketSchema>;
export type ClassifyPriority = z.infer<typeof classifyPrioritySchema>;
