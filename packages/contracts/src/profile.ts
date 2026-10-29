import { z } from 'zod';
import { registerSchema, emailSchema, publicUserSchema } from './auth.js';
export const updateProfileSchema = z
  .strictObject({
    name: registerSchema.shape.name.optional(),
    email: emailSchema.optional(),
    currentPassword: z.string().min(1).max(256).optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.email !== undefined,
    'Informe nome ou e-mail.',
  );
export const profileResultSchema = z.strictObject({
  user: publicUserSchema,
  reauthenticate: z.boolean(),
});
export type UpdateProfile = z.infer<typeof updateProfileSchema>;
