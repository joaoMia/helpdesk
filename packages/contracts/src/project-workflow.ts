import { z } from 'zod';
export const projectStateSchema = z.enum([
  'REQUESTED',
  'PLANNING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELED',
]);
export const activityStateSchema = z.enum(['TODO', 'IN_PROGRESS', 'DONE']);
const title = z.string().trim().min(3).max(160),
  description = z.string().trim().max(2000).default('');
const activity = z.strictObject({
  id: z.uuid().optional(),
  title,
  description,
  order: z.number().int().positive().max(200),
});
export const projectPlanSchema = z
  .strictObject({
    stages: z
      .array(
        z.strictObject({
          id: z.uuid().optional(),
          title,
          description,
          order: z.number().int().positive().max(25),
          activities: z.array(activity).max(200),
        }),
      )
      .max(25),
  })
  .superRefine((v, ctx) => {
    const ids = new Set<string>();
    let count = 0;
    function check(
      items: { id?: string; order: number }[],
      path: (string | number)[],
    ) {
      items.forEach((x, i) => {
        if (x.order !== i + 1)
          ctx.addIssue({
            code: 'custom',
            message: 'A ordem deve ser contígua.',
            path: [...path, i, 'order'],
          });
        if (x.id) {
          if (ids.has(x.id))
            ctx.addIssue({
              code: 'custom',
              message: 'Identificador repetido.',
              path,
            });
          ids.add(x.id);
        }
      });
    }
    check(v.stages, ['stages']);
    v.stages.forEach((s, i) => {
      count += s.activities.length;
      check(s.activities, ['stages', i, 'activities']);
    });
    if (count > 200)
      ctx.addIssue({
        code: 'custom',
        message: 'Limite de 200 atividades.',
        path: ['stages'],
      });
  });
export const projectMutationSchema = z.strictObject({
  expectedRevision: z.number().int().positive(),
  clientOperationId: z.uuid(),
});
export const projectPrioritySchema = projectMutationSchema.extend({
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  reason: z.string().trim().min(3).max(2000),
});
export const projectRetireSchema = projectMutationSchema.extend({
  reason: z.string().trim().min(3).max(2000),
});
export const projectAssignmentSchema = projectMutationSchema.extend({
  technicianId: z.uuid(),
  reason: z.string().trim().min(3).max(2000),
});
export const projectReasonSchema = projectMutationSchema.extend({
  reason: z.string().trim().min(3).max(2000),
});
export const projectDraftSchema = projectMutationSchema.extend({
  definition: projectPlanSchema,
});
export const projectActivitySchema = projectMutationSchema.extend({
  state: activityStateSchema,
  reason: z.string().trim().max(2000).default(''),
});
export const projectUpdateSchema = projectMutationSchema.extend({
  content: z.string().trim().min(1).max(4000),
  correctionOf: z.uuid().optional(),
});
export const projectWorkflowQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(120).default(''),
  state: projectStateSchema.optional(),
  ownerId: z.uuid().optional(),
});
export const projectHistoryQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ProjectPlan = z.infer<typeof projectPlanSchema>;
export type ProjectMutation = z.infer<typeof projectMutationSchema>;
export type ProjectState = z.infer<typeof projectStateSchema>;
const progress = z.strictObject({
  done: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  percent: z.number().int().min(0).max(100),
});
const planActivity = activity.extend({
  id: z.uuid(),
  state: activityStateSchema,
});
const planStage = z.strictObject({
  id: z.uuid(),
  title,
  description,
  order: z.number().int().positive(),
  activities: z.array(planActivity),
  progress: progress.nullable(),
  state: activityStateSchema,
  completedAt: z.iso.datetime().nullable(),
});
export const projectWorkflowSchema = z.strictObject({
  id: z.uuid(),
  code: z.number().int(),
  title: z.string(),
  objective: z.string(),
  need: z.string(),
  requesterName: z.string().nullable().optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable(),
  createdAt: z.iso.datetime(),
  state: projectStateSchema,
  revision: z.number().int().positive(),
  owner: z.strictObject({ id: z.uuid(), name: z.string() }).nullable(),
  startedAt: z.iso.datetime().nullable(),
  completedAt: z.iso.datetime().nullable(),
  canceledAt: z.iso.datetime().nullable(),
  progress: progress.nullable(),
  plan: z
    .strictObject({
      id: z.uuid(),
      version: z.number().int().positive(),
      createdAt: z.iso.datetime(),
      stages: z.array(planStage),
    })
    .nullable(),
  draft: projectPlanSchema.nullable(),
  permissions: z.strictObject({
    manage: z.boolean(),
    assign: z.boolean(),
    publish: z.boolean(),
    execute: z.boolean(),
    cancel: z.boolean(),
    setPriority: z.boolean(),
    retire: z.boolean(),
  }),
});
export const projectWorkflowListSchema = z.strictObject({
  items: z.array(projectWorkflowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const projectWorkflowHistorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: z.uuid(),
      kind: z.string(),
      summary: z.string(),
      actor: z.string(),
      createdAt: z.iso.datetime(),
      revision: z.number().int().nonnegative(),
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const projectUpdatesSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: z.uuid(),
      content: z.string(),
      author: z.string(),
      createdAt: z.iso.datetime(),
      revision: z.number().int().positive(),
      correctionOf: z.uuid().nullable(),
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const projectDashboardSchema = z.strictObject({
  total: z.number().int().nonnegative(),
  unassigned: z.number().int().nonnegative(),
  pendingActivities: z.number().int().nonnegative(),
  byState: z.array(
    z.strictObject({
      name: projectStateSchema,
      count: z.number().int().nonnegative(),
    }),
  ),
  byOwner: z.array(
    z.strictObject({
      id: z.uuid(),
      name: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  monthly: z.array(
    z.strictObject({
      month: z.string(),
      requested: z.number().int().nonnegative(),
      completed: z.number().int().nonnegative(),
      canceled: z.number().int().nonnegative(),
    }),
  ),
  recent: z.array(projectWorkflowSchema),
  updates: z.array(
    z.strictObject({
      id: z.uuid(),
      projectId: z.uuid(),
      code: z.number().int(),
      content: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
  progressHistory: z.array(
    z.strictObject({
      projectId: z.uuid(),
      code: z.number().int(),
      percent: z.number().int().nullable(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type ProjectWorkflow = z.infer<typeof projectWorkflowSchema>;
export type ProjectDashboard = z.infer<typeof projectDashboardSchema>;
export const projectPlanVersionsSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      version: z.number().int().positive(),
      createdAt: z.iso.datetime(),
      author: z.string(),
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const projectPublishedPlanSchema =
  projectWorkflowSchema.shape.plan.unwrap();
