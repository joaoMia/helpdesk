import { z } from 'zod';
export * from './auth.js';
export * from './profile.js';
export * from './technician.js';

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
