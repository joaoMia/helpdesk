import { z } from 'zod';
import { registerSchema, emailSchema } from './auth.js';
export const createTechnicianSchema = z.strictObject({
  name: registerSchema.shape.name,
  email: emailSchema,
});
export const updateTechnicianSchema = createTechnicianSchema
  .partial()
  .refine(
    (v) => v.name !== undefined || v.email !== undefined,
    'Informe nome ou e-mail.',
  );
export const technicianQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(120).default(''),
});
export const technicianSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const technicianListSchema = z.strictObject({
  items: z.array(technicianSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export const technicianCreatedSchema = z.strictObject({
  technician: technicianSchema,
  temporaryPassword: z.string().min(12).max(128),
});
export type Technician = z.infer<typeof technicianSchema>;
export type TechnicianInput = z.infer<typeof createTechnicianSchema>;
export type TechnicianUpdate = z.infer<typeof updateTechnicianSchema>;
