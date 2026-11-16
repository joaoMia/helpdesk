import { z } from 'zod';
const id = z.uuid(),
  stamp = z.iso.datetime({ offset: true });
export const conversationQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
export const projectMessageInputSchema = z.strictObject({
  clientMessageId: id,
  content: z.string().trim().min(1).max(4000),
  attachmentIds: z
    .array(id)
    .max(10)
    .refine((v) => new Set(v).size === v.length)
    .default([]),
});
const files = z
  .array(id)
  .max(10)
  .refine((v) => new Set(v).size === v.length)
  .default([]);
export const commentInputSchema = z.strictObject({
  clientMessageId: id.optional(),
  content: z.string().trim().min(1).max(4000),
  attachmentIds: files,
});
export const solutionInputSchema = z.strictObject({
  solvedAt: stamp.optional(),
  description: z.string().trim().min(1).max(4000),
  attachmentIds: files,
});
export const attachmentNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine(
    (v) =>
      !/[\\/]/.test(v) &&
      [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
  )
  .refine((v) => !/[. ]$/.test(v));
export const attachmentSchema = z.strictObject({
  id,
  uploaderId: id,
  name: z.string(),
  mime: z.string(),
  size: z.number().int().positive(),
  createdAt: stamp,
  uploaderName: z.string(),
  previewable: z.boolean(),
});
export const conversationSchema = z.strictObject({
  comments: z.array(
    z.strictObject({
      id,
      authorName: z.string(),
      authorId: id,
      content: z.string(),
      createdAt: stamp,
      attachments: z.array(attachmentSchema),
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number(),
  pageSize: z.number(),
  attachments: z.array(attachmentSchema),
  solution: z
    .strictObject({
      id,
      description: z.string(),
      authorName: z.string(),
      createdAt: stamp,
      attachments: z.array(attachmentSchema),
    })
    .nullable(),
});
export type Conversation = z.infer<typeof conversationSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
