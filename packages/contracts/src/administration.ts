import { z } from 'zod';
import { emailSchema, registerSchema } from './auth.js';
const id = z.uuid();
export const adminPageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(120).default(''),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
});
export const adminUserQuerySchema = adminPageQuerySchema.extend({
  role: z.enum(['ADMIN', 'TECHNICIAN', 'REQUESTER']).optional(),
  companyId: id.optional(),
  departmentId: id.optional(),
});
export const departmentQuerySchema = adminPageQuerySchema.extend({
  companyId: id.optional(),
});
const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9_.-]{2,39}$/)
  .nullable();
export const adminUserInputSchema = z.strictObject({
  name: registerSchema.shape.name,
  email: emailSchema,
  role: z.enum(['ADMIN', 'TECHNICIAN', 'REQUESTER']),
  username: username.optional(),
  companyId: id.nullable().optional(),
  departmentId: id.nullable().optional(),
  workScheduleId: id.nullable().optional(),
});
export const adminUserUpdateSchema = adminUserInputSchema
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Informe os campos a atualizar.');
export const companyInputSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).default(''),
  isActive: z.boolean().default(true),
  workScheduleId: id.nullable().optional(),
});
export const companyUpdateSchema = companyInputSchema
  .omit({ description: true, isActive: true })
  .partial()
  .extend({
    description: z.string().trim().max(1000).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export const departmentInputSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  companyId: id,
  isActive: z.boolean().default(true),
});
export const departmentUpdateSchema = departmentInputSchema
  .omit({ isActive: true })
  .partial()
  .extend({ isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0);
const interval = z
  .strictObject({
    startMinute: z.number().int().min(0).max(1439),
    endMinute: z.number().int().min(1).max(1440),
  })
  .refine(
    (v) => v.endMinute > v.startMinute,
    'O fim deve ser posterior ao início.',
  );
function overlapping(intervals: { startMinute: number; endMinute: number }[]) {
  const sorted = [...intervals].sort((a, b) => a.startMinute - b.startMinute);
  return sorted.some(
    (v, i) => i > 0 && v.startMinute < sorted[i - 1]!.endMinute,
  );
}
const weekly = z
  .array(interval.safeExtend({ day: z.number().int().min(0).max(6) }))
  .max(84)
  .refine(
    (v) =>
      ![0, 1, 2, 3, 4, 5, 6].some((day) =>
        overlapping(v.filter((i) => i.day === day)),
      ),
    'Intervalos do mesmo dia não podem se sobrepor.',
  );
const exceptions = z
  .array(
    z.strictObject({
      date: z.iso.date(),
      intervals: z
        .array(interval)
        .max(12)
        .refine((v) => !overlapping(v), 'Intervalos da exceção se sobrepõem.'),
    }),
  )
  .max(366)
  .refine(
    (v) => new Set(v.map((x) => x.date)).size === v.length,
    'Datas de exceção devem ser distintas.',
  );
export const scheduleInputSchema = z.strictObject({
  name: z.string().trim().min(2).max(120),
  isActive: z.boolean().default(true),
  timezone: z
    .string()
    .trim()
    .max(64)
    .refine((v) => {
      try {
        if (v !== 'UTC' && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(v))
          return false;
        new Intl.DateTimeFormat('pt-BR', { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, 'Fuso horário inválido.'),
  weekly,
  exceptions: exceptions.default([]),
});
export const scheduleUpdateSchema = scheduleInputSchema
  .omit({ isActive: true, exceptions: true })
  .partial()
  .extend({
    isActive: z.boolean().optional(),
    exceptions: exceptions.optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
export const organizationDefaultSchema = z.strictObject({ workScheduleId: id });
const times = { createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };
export const adminUserSchema = z.strictObject({
  canDelete: z.boolean().optional(),
  deleteBlockedReason: z.string().nullable().optional(),
  id,
  name: z.string(),
  email: z.email(),
  role: z.enum(['ADMIN', 'TECHNICIAN', 'REQUESTER']),
  username: z.string().nullable(),
  companyId: id.nullable(),
  departmentId: id.nullable(),
  workScheduleId: id.nullable(),
  companyName: z.string().nullable(),
  departmentName: z.string().nullable(),
  workScheduleName: z.string().nullable(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
  ...times,
});
export const companySchema = z.strictObject({
  id,
  name: z.string(),
  description: z.string(),
  isActive: z.boolean(),
  workScheduleId: id.nullable(),
  userCount: z.number().int().nonnegative(),
  ...times,
});
export const departmentSchema = z.strictObject({
  id,
  name: z.string(),
  companyId: id,
  companyName: z.string(),
  isActive: z.boolean(),
  userCount: z.number().int().nonnegative(),
  ...times,
});
export const scheduleVersionSchema = z.strictObject({
  id,
  version: z.number().int().positive(),
  timezone: z.string(),
  weekly,
  exceptions,
  createdAt: z.iso.datetime(),
});
export const scheduleSchema = z.strictObject({
  id,
  name: z.string(),
  isActive: z.boolean(),
  versions: z.array(scheduleVersionSchema),
  ...times,
});
const page = {
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
};
export const adminUserListSchema = z.strictObject({
  items: z.array(adminUserSchema),
  ...page,
});
export const companyListSchema = z.strictObject({
  items: z.array(companySchema),
  ...page,
});
export const departmentListSchema = z.strictObject({
  items: z.array(departmentSchema),
  ...page,
});
export const scheduleListSchema = z.strictObject({
  items: z.array(scheduleSchema),
  ...page,
});
export const scheduleVersionListSchema = z.strictObject({
  items: z.array(scheduleVersionSchema),
  ...page,
});
export const adminUserCreatedSchema = z.strictObject({
  user: adminUserSchema,
  temporaryPassword: z.string().min(12).max(128),
});
export type AdminUser = z.infer<typeof adminUserSchema>;
export type AdminUserInput = z.infer<typeof adminUserInputSchema>;
export type AdminUserUpdate = z.infer<typeof adminUserUpdateSchema>;
export type AdminUserQuery = z.infer<typeof adminUserQuerySchema>;
export type Company = z.infer<typeof companySchema>;
export type Department = z.infer<typeof departmentSchema>;
export type WorkSchedule = z.infer<typeof scheduleSchema>;
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;
export type ScheduleUpdate = z.infer<typeof scheduleUpdateSchema>;
export type CompanyInput = z.infer<typeof companyInputSchema>;
export type DepartmentInput = z.infer<typeof departmentInputSchema>;
export type AdminPageQuery = z.infer<typeof adminPageQuerySchema>;
