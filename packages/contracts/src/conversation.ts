import { z } from 'zod';
const id = z.uuid(),
  stamp = z.iso.datetime({ offset: true });
export const attachmentMimeByExtension = {
  '.jpg': 'image/png',
  '.jpeg': 'image/png',
  '.png': 'image/png',
  '.webp': 'image/png',
  '.gif': 'image/png',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx':
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const;
export const attachmentMimeSchema = z.enum([
  ...new Set(Object.values(attachmentMimeByExtension)),
]);
export const conversationQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});
const files = z
  .array(id)
  .max(10)
  .refine((v) => new Set(v).size === v.length)
  .default([]);
const messageInput = {
  content: z.string().trim().max(4000).default(''),
  attachmentIds: files,
};
const hasMessageContent = (message: {
  content: string;
  attachmentIds: string[];
}) => message.content.length > 0 || message.attachmentIds.length > 0;
const emptyMessage = {
  path: ['content'],
  message: 'Informe texto ou anexe um arquivo.',
};

export const projectMessageInputSchema = z
  .strictObject({ ...messageInput, clientMessageId: id })
  .refine(hasMessageContent, emptyMessage);
export const commentInputSchema = z
  .strictObject({ ...messageInput, clientMessageId: id.optional() })
  .refine(hasMessageContent, emptyMessage);
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
