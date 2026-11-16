import { z } from 'zod';
export const projectRequestInputSchema = z.strictObject({
  title: z.string().trim().min(3).max(160),
  objective: z.string().trim().min(10).max(4000),
  need: z.string().trim().min(10).max(4000),
});
export const projectQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(120).default(''),
});
export const projectRequestSchema = projectRequestInputSchema.extend({
  id: z.uuid(),
  code: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable(),
});
export const projectListSchema = z.strictObject({
  items: z.array(projectRequestSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const projectHistorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: z.uuid(),
      type: z.literal('REQUESTED'),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type ProjectRequest = z.infer<typeof projectRequestSchema>;

export const createProjectSchema = projectRequestInputSchema.extend({
  clientOperationId: z.uuid(),
  form: z
    .strictObject({
      categoryId: z.uuid(),
      versionId: z.uuid(),
      answers: z.record(
        z.string(),
        z.union([
          z.string().max(4000),
          z.number().finite(),
          z.boolean(),
          z.array(z.string().max(4000)).max(100),
        ]),
      ),
    })
    .optional(),
});
