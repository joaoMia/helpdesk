import { z } from 'zod';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());
export const passwordSchema = z
  .string()
  .max(256)
  .refine((value) => {
    const length = Array.from(value).length;
    return length >= 12 && length <= 128;
  }, 'Use de 12 a 128 caracteres na senha.');
const currentPassword = z.string().min(1).max(256);
export const registerSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
});
export const loginSchema = z.strictObject({
  email: emailSchema,
  password: currentPassword,
});
export const changePasswordSchema = z.strictObject({
  currentPassword,
  newPassword: passwordSchema,
});
export const publicUserSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: z.enum(['ADMIN', 'TECHNICIAN', 'REQUESTER']),
  mustChangePassword: z.boolean(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;
