import { z } from 'zod';
const id = z.uuid(),
  stamp = z.iso.datetime({ offset: true }),
  priority = z.enum(['LOW', 'MEDIUM', 'HIGH']);
export const slaPolicyInputSchema = z.strictObject({
  priority,
  targetMinutes: z.number().int().min(1).max(525600),
});
export const pendingReasonInputSchema = z.strictObject({
  name: z.string().trim().min(2).max(160),
  isActive: z.boolean().default(true),
  countsTowardSolution: z.boolean().default(false),
  autoResumeOnRequesterActivity: z.boolean().default(false),
});
export const pendingReasonUpdateSchema = pendingReasonInputSchema
  .extend({
    isActive: z.boolean(),
    countsTowardSolution: z.boolean(),
    autoResumeOnRequesterActivity: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0);
export const pendingInputSchema = z.strictObject({
  reasonId: id,
  justification: z.string().trim().min(1).max(2000),
});
export const emptyOperationSchema = z.strictObject({});
export const pendingSnapshotSchema = z.strictObject({
  name: z.string(),
  countsTowardSolution: z.boolean(),
  autoResumeOnRequesterActivity: z.boolean(),
});
export const metricSnapshotSchema = z.strictObject({
  engineVersion: z.literal(1),
  asOf: stamp,
  aSeconds: z.number().int().nonnegative().nullable(),
  bSeconds: z.number().int().nonnegative().nullable(),
  complete: z.boolean(),
  calendarSegmentIds: z.array(id),
  pendingPeriodIds: z.array(id),
});
export const slaRevisionSchema = z.strictObject({
  id,
  priority,
  targetMinutes: z.number(),
  policyVersion: z.number(),
  startedAt: stamp.nullable(),
  endedAt: stamp.nullable(),
  consumedSeconds: z.number().nonnegative().nullable(),
  remainingSeconds: z.number().nullable(),
  met: z.boolean().nullable(),
  finishReason: z.string().nullable(),
});
export const solutionDeadlineReasonSchema = z.enum([
  'POLICY_MISSING',
  'NOT_STARTED',
  'SLA_ENDED',
  'SLA_SUSPENDED',
  'CALENDAR_MISSING',
  'CALENDAR_GAP',
  'INVALID_CALENDAR',
  'INVALID_PENDING',
  'UNKNOWN_CONSUMPTION',
  'NO_WORKING_TIME',
]);
export type SolutionDeadlineReason = z.infer<
  typeof solutionDeadlineReasonSchema
>;
export const ticketMetricsSchema = z.strictObject({
  diagnostics: z
    .strictObject({
      coverage: z.enum(['NONE', 'GAP', 'COMPLETE']),
      futureCalendarConfigured: z.boolean(),
      solutionMeasurement: z.enum([
        'MISSING_SNAPSHOT',
        'AVAILABLE',
        'HISTORICAL_GAP',
      ]),
    })
    .optional(),
  solutionMetrics: metricSnapshotSchema.nullable().optional(),
  metrics: metricSnapshotSchema,
  solutionDeadlineAt: stamp.nullable(),
  solutionDeadlineReason: solutionDeadlineReasonSchema.nullable().optional(),
  frozen: z.boolean(),
  sla: z.array(slaRevisionSchema),
  activePending: z
    .strictObject({
      id,
      justification: z.string(),
      startsAt: stamp,
      snapshot: pendingSnapshotSchema,
    })
    .nullable(),
});
export const pendingReasonSchema = pendingReasonInputSchema.extend({
  id,
  createdAt: stamp,
  updatedAt: stamp,
});
export const pendingReasonListSchema = z.strictObject({
  items: z.array(pendingReasonSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const slaPolicySchema = z.strictObject({
  id,
  priority,
  targetMinutes: z.number(),
  version: z.number(),
  createdAt: stamp,
});
export const slaPolicyListSchema = z.strictObject({
  items: z.array(slaPolicySchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
});
export const dashboardQuerySchema = z
  .strictObject({
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    companyId: id.optional(),
    departmentId: id.optional(),
    technicianId: id.optional(),
    priority: priority.optional(),
    status: z
      .enum(['OPEN', 'IN_PROGRESS', 'PENDING', 'RESOLVED', 'CLOSED'])
      .optional(),
  })
  .refine(
    (v) =>
      !v.from ||
      !v.to ||
      (v.from <= v.to &&
        Date.parse(v.to) - Date.parse(v.from) <= 3660 * 86400000),
  );
const group = z.array(
  z.strictObject({
    id: z.string().optional(),
    name: z.string(),
    count: z.number().int().nonnegative(),
  }),
);
export const dashboardSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  byStatus: group,
  byPriority: group,
  byCompany: group,
  byDepartment: group,
  byTechnician: group,
  monthly: z.array(
    z.strictObject({
      month: z.string(),
      opened: z.number().int().nonnegative(),
      resolved: z.number().int().nonnegative(),
      closed: z.number().int().nonnegative(),
    }),
  ),
  slaMet: z.number().int().nonnegative(),
  slaExceeded: z.number().int().nonnegative(),
  slaUnknown: z.number().int().nonnegative(),
  averageASeconds: z.number().nullable(),
  averageBSeconds: z.number().nullable(),
  finalMetricsCount: z.number().int().nonnegative(),
});
export type TicketMetrics = z.infer<typeof ticketMetricsSchema>;
export type Dashboard = z.infer<typeof dashboardSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
