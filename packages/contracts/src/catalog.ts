import { z } from 'zod';
const attributes = z.strictObject({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000),
  isActive: z.boolean(),
  displayOrder: z.number().int().min(0).max(100000),
});
export const categoryInputSchema = attributes.extend({
  description: attributes.shape.description.default(''),
  isActive: attributes.shape.isActive.default(true),
  displayOrder: attributes.shape.displayOrder.default(0),
});
export const categoryUpdateSchema = attributes
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Informe os campos da alteração.');
export const serviceInputSchema = categoryInputSchema.extend({
  categoryId: z.uuid(),
});
export const serviceUpdateSchema = attributes
  .extend({ categoryId: z.uuid() })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Informe os campos da alteração.');
export const catalogQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(120).default(''),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
});
export const serviceQuerySchema = catalogQuerySchema.extend({
  categoryId: z.uuid().optional(),
});
// Administrative attributes are absent from responses for readers.
export const categorySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  displayOrder: z.number().int(),
  isActive: z.boolean().optional(),
  createdAt: z.iso.datetime().optional(),
  updatedAt: z.iso.datetime().optional(),
});
export const catalogServiceSchema = categorySchema.extend({
  categoryId: z.uuid(),
  category: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    isActive: z.boolean().optional(),
  }),
});
const pagination = {
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int(),
};
export const categoryListSchema = z.strictObject({
  items: z.array(categorySchema),
  ...pagination,
});
export const serviceListSchema = z.strictObject({
  items: z.array(catalogServiceSchema),
  ...pagination,
});
export type Category = z.infer<typeof categorySchema>;
export type CatalogService = z.infer<typeof catalogServiceSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ServiceInput = z.infer<typeof serviceInputSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type ServiceUpdate = z.infer<typeof serviceUpdateSchema>;
export type CatalogQuery = z.infer<typeof serviceQuerySchema>;
