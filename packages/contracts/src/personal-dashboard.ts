import { z } from 'zod';

export const personalDashboardSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  triageAvailable: z.number().int().nonnegative(),
  byStatus: z.array(
    z.strictObject({ name: z.string(), count: z.number().int().nonnegative() }),
  ),
  byPriority: z.array(
    z.strictObject({ name: z.string(), count: z.number().int().nonnegative() }),
  ),
  sla: z.strictObject({
    met: z.number().int().nonnegative(),
    exceeded: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
  }),
  recent: z
    .array(
      z.strictObject({
        id: z.uuid(),
        code: z.number().int(),
        subject: z.string(),
        status: z.string(),
        priority: z.string().nullable(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
      }),
    )
    .max(8),
  updates: z
    .array(
      z.strictObject({
        id: z.uuid(),
        ticketId: z.uuid(),
        code: z.number().int(),
        eventType: z.string(),
        createdAt: z.iso.datetime(),
      }),
    )
    .max(8),
});
export type PersonalDashboard = z.infer<typeof personalDashboardSchema>;
