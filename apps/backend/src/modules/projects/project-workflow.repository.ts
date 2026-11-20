import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import { resourceNotFound, forbidden } from '../authorization/permissions.js';
import { ApplicationError } from '../../shared/errors.js';
import type { ProjectPlan } from '@helpdesk/contracts';
type Tx = Prisma.TransactionClient;
type Row = {
  id: string;
  code: number;
  requester_id: string;
  requester_name: string | null;
  title: string;
  objective: string;
  need: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  created_at: Date;
  state: string;
  revision: number;
  owner_id: string | null;
  owner_name: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  canceled_at: Date | null;
};
export const projectConflict = (
  message = 'O projeto mudou. Atualize antes de tentar novamente.',
) => new ApplicationError('PROJECT_CONFLICT', 409, message);
function canonical(x: unknown): string {
  if (Array.isArray(x)) return '[' + x.map(canonical).join(',') + ']';
  if (x && typeof x === 'object')
    return (
      '{' +
      Object.entries(x)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(x);
}
export function operationHash(x: unknown) {
  return createHash('sha256').update(canonical(x)).digest('hex');
}
const terminal = (s: string) => s === 'COMPLETED' || s === 'CANCELED';
function managesProject({ user }: Identity, ownerId: Row['owner_id']) {
  return (
    user.role === 'ADMIN' || (user.role === 'TECHNICIAN' && user.id === ownerId)
  );
}
const awaitingFirstPlan = (row: Row) =>
  row.state === 'REQUESTED' && row.owner_id !== null;
const percent = (states: string[]) =>
  states.length
    ? {
        total: states.length,
        done: states.filter((s) => s === 'DONE').length,
        percent: Math.floor(
          (100 * states.filter((s) => s === 'DONE').length) / states.length,
        ),
      }
    : null;
export class ProjectWorkflowRepository {
  constructor(readonly db: PrismaClient) {}
  private scope(i: Identity) {
    const active = Prisma.sql`NOT EXISTS (SELECT 1 FROM operational_retirements o WHERE o.project_id=r.id)`;
    return i.user.role === 'ADMIN'
      ? active
      : i.user.role === 'TECHNICIAN'
        ? Prisma.sql`${active} AND w.owner_id=${i.user.id}::uuid`
        : Prisma.sql`${active} AND r.requester_id=${i.user.id}::uuid`;
  }
  private async row(tx: Tx, i: Identity, id: string) {
    const rows = await tx.$queryRaw<
      Row[]
    >`SELECT r.*,COALESCE(w.state,'REQUESTED') AS state,COALESCE(w.revision,1) AS revision,w.owner_id,u.name AS owner_name,requester.name AS requester_name,w.started_at,w.completed_at,w.canceled_at FROM project_requests r LEFT JOIN project_workflows w ON w.project_id=r.id LEFT JOIN users u ON u.id=w.owner_id LEFT JOIN users requester ON requester.id=r.requester_id WHERE r.id=${id}::uuid AND ${this.scope(i)}`;
    if (!rows[0]) throw resourceNotFound();
    return rows[0];
  }
  async actor(tx: Tx, i: Identity) {
    await tx.$queryRaw`SELECT id FROM users WHERE id=${i.user.id}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${i.sessionId}::uuid FOR SHARE`;
    const u = await tx.user.findUnique({ where: { id: i.user.id } }),
      s = await tx.authSession.findUnique({ where: { id: i.sessionId } });
    if (
      !u ||
      !u.isActive ||
      u.mustChangePassword ||
      u.role !== i.user.role ||
      !s ||
      s.userId !== u.id ||
      s.revokedAt ||
      s.expiresAt <= new Date()
    )
      throw invalidSession();
  }
  async replay(tx: Tx, i: Identity, key: string, hash: string) {
    const rows = await tx.$queryRaw<
      { payload_hash: string; result: unknown }[]
    >`SELECT payload_hash,result FROM project_operations WHERE actor_id=${i.user.id}::uuid AND operation_id=${key}::uuid`;
    if (!rows[0]) return undefined;
    if (rows[0].payload_hash !== hash)
      throw projectConflict('Identificador reutilizado com dados diferentes.');
    return rows[0].result;
  }
  async remember(
    tx: Tx,
    i: Identity,
    key: string,
    id: string,
    hash: string,
    result: unknown,
  ) {
    await tx.$executeRaw`INSERT INTO project_operations(actor_id,operation_id,project_id,payload_hash,result,created_at) VALUES(${i.user.id}::uuid,${key}::uuid,${id}::uuid,${hash},${JSON.stringify(result)}::jsonb,${new Date()})`;
  }
  private async plan(tx: Tx, id: string, version?: number) {
    const ps = await tx.$queryRaw<
      { id: string; version: number; created_at: Date }[]
    >`SELECT id,version,created_at FROM project_plan_versions WHERE project_id=${id}::uuid AND sealed AND ${version ? Prisma.sql`version=${version}` : Prisma.sql`TRUE`} ORDER BY version DESC LIMIT 1`;
    const p = ps[0];
    if (!p) return null;
    const stages = await tx.$queryRaw<
      {
        id: string;
        logical_id: string;
        title: string;
        description: string;
        position: number;
      }[]
    >`SELECT * FROM project_plan_stages WHERE plan_id=${p.id}::uuid ORDER BY position`;
    const activities = await tx.$queryRaw<
      {
        logical_id: string;
        stage_id: string;
        title: string;
        description: string;
        position: number;
        state: string;
      }[]
    >`SELECT a.*,s.state FROM project_plan_activities a JOIN project_activity_states s ON s.project_id=a.project_id AND s.logical_id=a.logical_id WHERE a.plan_id=${p.id}::uuid ORDER BY a.position`;
    const events = await tx.$queryRaw<
      { details: Record<string, unknown>; created_at: Date }[]
    >`SELECT details,created_at FROM project_workflow_events WHERE project_id=${id}::uuid ORDER BY revision,id`;
    const completedAt = new Map<string, string>();
    for (const event of events) {
      const d = event.details as Record<string, unknown>;
      if (typeof d.activityId === 'string' && d.state === 'DONE')
        completedAt.set(d.activityId, event.created_at.toISOString());
      if (Array.isArray(d.activityChanges))
        for (const change of d.activityChanges as Record<string, unknown>[])
          if (typeof change.activityId === 'string' && change.state === 'DONE')
            completedAt.set(change.activityId, event.created_at.toISOString());
    }
    return {
      id: p.id,
      version: p.version,
      createdAt: p.created_at.toISOString(),
      stages: stages.map((s) => {
        const tasks = activities
          .filter((a) => a.stage_id === s.id)
          .map((a) => ({
            id: a.logical_id,
            title: a.title,
            description: a.description,
            order: a.position,
            state: a.state,
          }));
        const progress = percent(tasks.map((a) => a.state));
        const completed =
          tasks.length > 0 && tasks.every((a) => a.state === 'DONE');
        return {
          id: s.logical_id,
          title: s.title,
          description: s.description,
          order: s.position,
          activities: tasks,
          progress,
          state: completed
            ? 'DONE'
            : tasks.some((a) => a.state !== 'TODO')
              ? 'IN_PROGRESS'
              : 'TODO',
          completedAt: completed
            ? tasks.map((a) => completedAt.get(a.id) ?? null).every(Boolean)
              ? tasks
                  .map((a) => completedAt.get(a.id)!)
                  .sort()
                  .at(-1)!
              : null
            : null,
        };
      }),
    };
  }
  private async view(tx: Tx, i: Identity, r: Row, includeDetails = true) {
    const plan = await this.plan(tx, r.id),
      manage = managesProject(i, r.owner_id);
    const drafts =
      includeDetails && manage && !terminal(r.state)
        ? await tx.$queryRaw<
            { definition: ProjectPlan }[]
          >`SELECT definition FROM project_plan_drafts WHERE project_id=${r.id}::uuid`
        : [];
    return {
      id: r.id,
      code: r.code,
      title: r.title,
      objective: r.objective,
      need: r.need,
      ...(includeDetails ? { requesterName: r.requester_name } : {}),
      createdAt: r.created_at.toISOString(),
      state: r.state,
      revision: r.revision,
      owner: r.owner_id ? { id: r.owner_id, name: r.owner_name! } : null,
      startedAt: r.started_at?.toISOString() ?? null,
      completedAt: r.completed_at?.toISOString() ?? null,
      canceledAt: r.canceled_at?.toISOString() ?? null,
      plan,
      progress: percent(
        plan?.stages.flatMap((s) => s.activities.map((a) => a.state)) ?? [],
      ),
      draft: drafts[0]?.definition ?? null,
      priority: r.priority,
      permissions: {
        manage: manage && !terminal(r.state),
        assign: i.user.role === 'ADMIN' && !terminal(r.state),
        publish:
          manage &&
          (r.state === 'PLANNING' ||
            awaitingFirstPlan(r) ||
            (r.state === 'IN_PROGRESS' && i.user.role === 'ADMIN')),
        execute: manage && !terminal(r.state),
        cancel:
          !terminal(r.state) &&
          (i.user.role === 'ADMIN' ||
            (i.user.role === 'REQUESTER' && r.state === 'REQUESTED')),
        setPriority:
          (i.user.role === 'ADMIN' || r.owner_id === i.user.id) &&
          !terminal(r.state),
        retire: manage && !terminal(r.state),
      },
    };
  }
  read(i: Identity, id: string, version?: number) {
    return this.db.$transaction(
      async (tx) => {
        const row = await this.row(tx, i, id);
        if (version) {
          if (i.user.role === 'REQUESTER' && !row.owner_id)
            throw resourceNotFound();
          const p = await this.plan(tx, id, version);
          if (!p) throw resourceNotFound();
          return p;
        }
        return this.view(tx, i, row);
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  list(
    i: Identity,
    q: {
      page: number;
      pageSize: number;
      search: string;
      state?: string;
      ownerId?: string;
    },
  ) {
    return this.db.$transaction(
      async (tx) => {
        const where = Prisma.sql`${this.scope(i)} AND (${q.search}='' OR r.title ILIKE ${'%' + q.search + '%'} OR ('PR-'||r.code::text) ILIKE ${'%' + q.search + '%'}) AND ${q.state ? Prisma.sql`COALESCE(w.state,'REQUESTED')=${q.state}` : Prisma.sql`TRUE`} AND ${q.ownerId ? Prisma.sql`w.owner_id=${q.ownerId}::uuid` : Prisma.sql`TRUE`}`;
        const ids = await tx.$queryRaw<
          { id: string }[]
        >`SELECT r.id FROM project_requests r LEFT JOIN project_workflows w ON w.project_id=r.id WHERE ${where} ORDER BY r.created_at DESC,r.id DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;
        const count = await tx.$queryRaw<
          { total: number }[]
        >`SELECT count(*)::int AS total FROM project_requests r LEFT JOIN project_workflows w ON w.project_id=r.id WHERE ${where}`;
        const items = [];
        for (const { id } of ids)
          items.push(await this.view(tx, i, await this.row(tx, i, id), false));
        return {
          items,
          total: count[0]!.total,
          page: q.page,
          pageSize: q.pageSize,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  history(
    i: Identity,
    id: string,
    q: { page: number; pageSize: number },
    updates = false,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await this.row(tx, i, id);
        if (updates) {
          const items = await tx.$queryRaw<
            {
              id: string;
              content: string;
              author: string;
              createdAt: Date;
              revision: number;
              correctionOf: string | null;
            }[]
          >`SELECT v.id,v.content,u.name AS author,v.created_at AS "createdAt",v.revision,v.correction_of AS "correctionOf" FROM project_workflow_updates v JOIN users u ON u.id=v.actor_id WHERE v.project_id=${id}::uuid ORDER BY v.created_at DESC,v.revision DESC,v.id DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;
          const c = await tx.$queryRaw<
            { n: number }[]
          >`SELECT count(*)::int n FROM project_workflow_updates WHERE project_id=${id}::uuid`;
          return {
            items: items.map((x) => ({
              ...x,
              createdAt: x.createdAt.toISOString(),
            })),
            total: c[0]!.n,
            ...q,
          };
        }
        const entries = Prisma.sql`
          SELECT e.id, e.kind, e.summary, u.name AS actor, e.created_at AS "createdAt", e.revision
          FROM project_workflow_events e JOIN users u ON u.id=e.actor_id
          WHERE e.project_id=${id}::uuid AND NOT (
            e.kind='UPDATE_ADDED' AND EXISTS (
              SELECT 1 FROM project_workflow_updates v WHERE v.project_id=e.project_id AND v.revision=e.revision
            )
          )
          UNION ALL
          SELECT v.id, 'UPDATE_ADDED' AS kind,
            CASE WHEN v.correction_of IS NULL THEN 'Atualização publicada.' ELSE 'Correção de atualização publicada.' END || chr(10) || v.content,
            u.name AS actor, v.created_at AS "createdAt", v.revision
          FROM project_workflow_updates v JOIN users u ON u.id=v.actor_id
          WHERE v.project_id=${id}::uuid
          UNION ALL
          SELECT e.id, e.type AS kind, 'Solicitação recebida.' AS summary, u.name AS actor, e.created_at AS "createdAt", 0 AS revision
          FROM project_request_events e JOIN users u ON u.id=e.actor_id WHERE e.project_id=${id}::uuid`;
        const c = await tx.$queryRaw<
          { n: number }[]
        >`SELECT count(*)::int n FROM (${entries}) h`;
        const items = await tx.$queryRaw<
          {
            id: string;
            kind: string;
            summary: string;
            actor: string;
            createdAt: Date;
            revision: number;
          }[]
        >`SELECT * FROM (${entries}) h ORDER BY "createdAt" DESC,revision DESC,id DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;
        return {
          items: items.map((x) => ({
            ...x,
            createdAt: x.createdAt.toISOString(),
          })),
          total: c[0]!.n,
          ...q,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async versions(
    i: Identity,
    id: string,
    q: { page: number; pageSize: number },
  ) {
    return this.db.$transaction(async (tx) => {
      await this.row(tx, i, id);
      const rows = await tx.$queryRaw<
        { version: number; created_at: Date; author: string }[]
      >`SELECT p.version,p.created_at,u.name author FROM project_plan_versions p JOIN users u ON u.id=p.actor_id WHERE p.project_id=${id}::uuid AND sealed ORDER BY version DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`;
      const c = await tx.$queryRaw<
        { n: number }[]
      >`SELECT count(*)::int n FROM project_plan_versions WHERE project_id=${id}::uuid AND sealed`;
      return {
        items: rows.map((p) => ({
          version: p.version,
          createdAt: p.created_at.toISOString(),
          author: p.author,
        })),
        total: c[0]!.n,
        ...q,
      };
    });
  }
  async mutate(
    i: Identity,
    id: string,
    operation: string,
    input: {
      expectedRevision: number;
      clientOperationId: string;
      [k: string]: unknown;
    },
    activityId?: string,
  ) {
    const hash = operationHash({
      id,
      operation,
      input,
      activityId: activityId ?? null,
    });
    return this.db.$transaction(
      async (tx) => {
        await this.actor(tx, i);
        await tx.$queryRaw`SELECT id FROM project_requests WHERE id=${id}::uuid FOR UPDATE`;
        const row = await this.row(tx, i, id);
        const replay = await this.replay(tx, i, input.clientOperationId, hash);
        if (replay !== undefined) return replay;
        if (terminal(row.state) || row.revision !== input.expectedRevision)
          throw projectConflict();
        const admin = i.user.role === 'ADMIN',
          manager = managesProject(i, row.owner_id);
        if (operation === 'cancel') {
          if (
            !admin &&
            !(i.user.role === 'REQUESTER' && row.state === 'REQUESTED')
          )
            throw forbidden();
        } else if (operation === 'priority') {
          if (!admin && row.owner_id !== i.user.id) throw forbidden();
        } else if (operation === 'assignment') {
          if (!admin) throw forbidden();
        } else if (!manager) throw forbidden();
        await tx.$executeRaw`INSERT INTO project_workflows(project_id) VALUES(${id}::uuid) ON CONFLICT DO NOTHING`;
        const opensLegacyPlan =
          awaitingFirstPlan(row) &&
          (operation === 'draft' || operation === 'publish');
        let kind: string,
          summary: string,
          details: unknown = {},
          nextState = opensLegacyPlan ? 'PLANNING' : row.state,
          ownerId = row.owner_id;
        const now = new Date();
        const currentPlan = await this.plan(tx, id);
        const previousProgress = percent(
          currentPlan?.stages.flatMap((s) =>
            s.activities.map((a) => a.state),
          ) ?? [],
        );
        if (operation === 'priority') {
          await tx.$executeRaw`UPDATE project_requests SET priority=${input.priority as 'HIGH' | 'MEDIUM' | 'LOW' | null} WHERE id=${id}::uuid`;
          kind = 'PRIORITY_CHANGED';
          summary =
            'Prioridade do projeto alterada para ' +
            (input.priority ?? 'Não definida') +
            '. ' +
            input.reason;
          details = { previous: row.priority, current: input.priority };
        } else if (operation === 'retire') {
          await tx.operationalRetirement.create({
            data: {
              actorId: i.user.id,
              projectId: id,
              reason: String(input.reason),
            },
          });
          kind = 'RETIRED';
          summary = 'Projeto retirado da operação. ' + input.reason;
        } else if (operation === 'assignment') {
          await tx.$queryRaw`SELECT id FROM users WHERE id=${input.technicianId as string}::uuid FOR SHARE`;
          const u = await tx.user.findFirst({
            where: {
              id: input.technicianId as string,
              role: 'TECHNICIAN',
              isActive: true,
              mustChangePassword: false,
            },
          });
          if (!u)
            throw new ApplicationError(
              'INVALID_INPUT',
              400,
              'Selecione técnico ativo e elegível.',
            );
          if (u.id === row.owner_id)
            throw projectConflict('O técnico já é responsável.');
          ownerId = u.id;
          if (row.state === 'REQUESTED') nextState = 'PLANNING';
          kind = row.owner_id ? 'REASSIGNED' : 'ASSIGNED';
          summary =
            'Responsável definido: ' + u.name + '. Motivo: ' + input.reason;
          details = { previousOwnerId: row.owner_id, ownerId };
        } else if (operation === 'draft') {
          if (!['PLANNING', 'IN_PROGRESS'].includes(nextState))
            throw projectConflict();
          const definition = input.definition as ProjectPlan;
          const drafts = await tx.$queryRaw<
            { definition: ProjectPlan }[]
          >`SELECT definition FROM project_plan_drafts WHERE project_id=${id}::uuid`;
          const allowedStages = new Set([
            ...(currentPlan?.stages.map((s) => s.id) ?? []),
            ...(drafts[0]?.definition.stages.map((s) => s.id) ?? []),
          ]);
          const allowedActivities = new Set([
            ...(currentPlan?.stages.flatMap((s) =>
              s.activities.map((a) => a.id),
            ) ?? []),
            ...(drafts[0]?.definition.stages.flatMap((s) =>
              s.activities.map((a) => a.id),
            ) ?? []),
          ]);
          for (const stage of definition.stages) {
            if (stage.id && !allowedStages.has(stage.id))
              throw new ApplicationError(
                'INVALID_INPUT',
                400,
                'Etapa não pertence ao rascunho ou plano vigente.',
              );
            stage.id ??= randomUUID();
            for (const a of stage.activities) {
              if (a.id && !allowedActivities.has(a.id))
                throw new ApplicationError(
                  'INVALID_INPUT',
                  400,
                  'Atividade não pertence ao projeto.',
                );
              a.id ??= randomUUID();
            }
          }
          await tx.$executeRaw`INSERT INTO project_plan_drafts(project_id,definition,updated_at,actor_id) VALUES(${id}::uuid,${JSON.stringify(definition)}::jsonb,${now},${i.user.id}::uuid) ON CONFLICT(project_id) DO UPDATE SET definition=EXCLUDED.definition,updated_at=EXCLUDED.updated_at,actor_id=EXCLUDED.actor_id`;
          kind = 'DRAFT_SAVED';
          summary = 'Rascunho salvo.';
        } else if (operation === 'draft-delete') {
          if (!['PLANNING', 'IN_PROGRESS'].includes(row.state) || !manager)
            throw forbidden();
          const deleted =
            await tx.$executeRaw`DELETE FROM project_plan_drafts WHERE project_id=${id}::uuid`;
          if (deleted !== 1)
            throw projectConflict('Não há rascunho para excluir.');
          kind = 'DRAFT_DELETED';
          summary =
            'Rascunho de planejamento excluído. Versões publicadas foram preservadas.';
        } else if (operation === 'publish') {
          if (
            !['PLANNING', 'IN_PROGRESS'].includes(nextState) ||
            (row.state === 'IN_PROGRESS' && !admin)
          )
            throw forbidden();
          const drafts = await tx.$queryRaw<
            { definition: ProjectPlan }[]
          >`SELECT definition FROM project_plan_drafts WHERE project_id=${id}::uuid`;
          const def = drafts[0]?.definition;
          if (
            !def?.stages.length ||
            def.stages.some((s) => !s.activities.length)
          )
            throw projectConflict(
              'Publique ao menos uma etapa com atividades.',
            );
          if (currentPlan) {
            const previous = {
              stages: currentPlan.stages.map((s) => ({
                id: s.id,
                title: s.title,
                description: s.description,
                order: s.order,
                activities: s.activities.map((a) => ({
                  id: a.id,
                  title: a.title,
                  description: a.description,
                  order: a.order,
                })),
              })),
            };
            if (canonical(previous) === canonical(def))
              throw projectConflict(
                'O rascunho já corresponde ao plano publicado.',
              );
          }
          const version = (currentPlan?.version ?? 0) + 1,
            planId = randomUUID();
          await tx.$executeRaw`INSERT INTO project_plan_versions(id,project_id,version,created_at,actor_id) VALUES(${planId}::uuid,${id}::uuid,${version},${now},${i.user.id}::uuid)`;
          for (const stage of def.stages) {
            const stageId = randomUUID();
            await tx.$executeRaw`INSERT INTO project_plan_stages(id,plan_id,logical_id,position,title,description) VALUES(${stageId}::uuid,${planId}::uuid,${stage.id!}::uuid,${stage.order},${stage.title},${stage.description})`;
            for (const a of stage.activities) {
              await tx.$executeRaw`INSERT INTO project_activity_states(project_id,logical_id,updated_at,actor_id) VALUES(${id}::uuid,${a.id!}::uuid,${now},${i.user.id}::uuid) ON CONFLICT DO NOTHING`;
              await tx.$executeRaw`INSERT INTO project_plan_activities(plan_id,stage_id,project_id,logical_id,position,title,description) VALUES(${planId}::uuid,${stageId}::uuid,${id}::uuid,${a.id!}::uuid,${a.order},${a.title},${a.description})`;
            }
          }
          await tx.$executeRaw`UPDATE project_plan_versions SET sealed=true WHERE id=${planId}::uuid`;
          const nextPlan = await this.plan(tx, id),
            progress = percent(
              nextPlan!.stages.flatMap((s) => s.activities.map((a) => a.state)),
            );
          kind = version === 1 ? 'PLAN_PUBLISHED' : 'PLAN_REVISED';
          summary =
            'Plano v' +
            version +
            ' publicado. ' +
            (input.reason as string) +
            ' Progresso: ' +
            (previousProgress?.percent ?? 'sem plano') +
            ' → ' +
            progress!.percent +
            '%.';
          details = { version, previousProgress, progress };
        } else if (operation === 'start') {
          if (row.state !== 'PLANNING' || !currentPlan)
            throw projectConflict('É necessário plano publicado para iniciar.');
          nextState = 'IN_PROGRESS';
          kind = 'STARTED';
          summary = 'Execução iniciada.';
        } else if (operation === 'stage-complete') {
          if (row.state !== 'IN_PROGRESS')
            throw projectConflict(
              'Etapas só podem ser concluídas durante a execução.',
            );
          const stage = currentPlan?.stages.find((s) => s.id === activityId);
          if (!stage || !stage.activities.length) throw resourceNotFound();
          const pending = stage.activities.filter((a) => a.state !== 'DONE');
          if (!pending.length)
            throw projectConflict('A etapa já está concluída.');
          for (const a of pending)
            await tx.$executeRaw`UPDATE project_activity_states SET state='DONE',updated_at=${now},actor_id=${i.user.id}::uuid WHERE project_id=${id}::uuid AND logical_id=${a.id}::uuid`;
          kind = 'ACTIVITY_CHANGED';
          summary = `Etapa ${stage.order} concluída: ${stage.title}.`;
          details = {
            stageId: stage.id,
            activityChanges: pending.map((a) => ({
              activityId: a.id,
              previousState: a.state,
              state: 'DONE',
            })),
          };
        } else if (operation === 'activity') {
          if (row.state !== 'IN_PROGRESS') throw projectConflict();
          const a = currentPlan?.stages
            .flatMap((s) => s.activities)
            .find((a) => a.id === activityId);
          if (!a) throw resourceNotFound();
          if (a.state === input.state)
            throw projectConflict('A atividade já está nessa situação.');
          if (a.state === 'DONE' && String(input.reason).trim().length < 3)
            throw new ApplicationError(
              'INVALID_INPUT',
              400,
              'Justifique o retrabalho.',
            );
          await tx.$executeRaw`UPDATE project_activity_states SET state=${input.state as string},updated_at=${now},actor_id=${i.user.id}::uuid WHERE project_id=${id}::uuid AND logical_id=${activityId!}::uuid`;
          kind = a.state === 'DONE' ? 'REWORK' : 'ACTIVITY_CHANGED';
          summary =
            a.title +
            ': ' +
            a.state +
            ' → ' +
            input.state +
            '. ' +
            input.reason;
          details = { activityId, previousState: a.state, state: input.state };
        } else if (operation === 'complete') {
          if (
            row.state !== 'IN_PROGRESS' ||
            !previousProgress ||
            previousProgress.done !== previousProgress.total
          )
            throw projectConflict(
              'Conclua todas as atividades do plano vigente.',
            );
          nextState = 'COMPLETED';
          kind = 'COMPLETED';
          summary = 'Projeto concluído. ' + input.reason;
        } else if (operation === 'cancel') {
          nextState = 'CANCELED';
          kind = 'CANCELED';
          summary = 'Projeto cancelado. ' + input.reason;
          details = { progress: previousProgress };
        } else throw resourceNotFound();
        if (
          opensLegacyPlan ||
          operation === 'start' ||
          operation === 'complete'
        ) {
          await tx.$queryRaw`SELECT id FROM users WHERE id=${ownerId!}::uuid FOR SHARE`;
          const eligible = await tx.user.findFirst({
            where: {
              id: ownerId!,
              role: 'TECHNICIAN',
              isActive: true,
              mustChangePassword: false,
            },
            select: { id: true },
          });
          if (!eligible)
            throw projectConflict(
              'Defina responsável elegível antes de continuar.',
            );
        }
        const changed =
          await tx.$executeRaw`UPDATE project_workflows SET state=${nextState},owner_id=${ownerId}::uuid,revision=revision+1,started_at=${operation === 'start' ? now : row.started_at},completed_at=${operation === 'complete' ? now : row.completed_at},canceled_at=${operation === 'cancel' ? now : row.canceled_at} WHERE project_id=${id}::uuid AND revision=${input.expectedRevision}`;
        if (changed !== 1) throw projectConflict();
        const progressAfter = percent(
          (await this.plan(tx, id))?.stages.flatMap((s) =>
            s.activities.map((a) => a.state),
          ) ?? [],
        );
        details = {
          ...(details as object),
          ...(row.state === 'REQUESTED' && nextState === 'PLANNING'
            ? { previousState: row.state, state: nextState }
            : {}),
          progressBefore: previousProgress?.percent ?? null,
          progressAfter: progressAfter?.percent ?? null,
        };
        if (row.state === 'REQUESTED' && nextState === 'PLANNING')
          summary += ' Status alterado automaticamente para Em planejamento.';
        await tx.$executeRaw`INSERT INTO project_workflow_events(project_id,actor_id,kind,summary,details,revision,created_at) VALUES(${id}::uuid,${i.user.id}::uuid,${kind},${summary},${JSON.stringify(details)}::jsonb,${row.revision + 1},${now})`;
        const result = await this.view(
          tx,
          i,
          operation === 'retire'
            ? { ...row, revision: row.revision + 1 }
            : await this.row(tx, i, id),
        );
        await this.remember(tx, i, input.clientOperationId, id, hash, result);
        return result;
      },
      { isolationLevel: 'ReadCommitted', timeout: 20000 },
    );
  }
  dashboard(i: Identity) {
    return this.db.$transaction(
      async (tx) => {
        const scope = this.scope(i);
        const count = await tx.$queryRaw<
          { total: number; unassigned: number }[]
        >`SELECT count(*)::int total,count(*) FILTER(WHERE w.owner_id IS NULL AND COALESCE(w.state,'REQUESTED') NOT IN ('COMPLETED','CANCELED'))::int unassigned FROM project_requests r LEFT JOIN project_workflows w ON w.project_id=r.id WHERE ${scope}`;
        const byState = await tx.$queryRaw<
          { name: string; count: number }[]
        >`SELECT COALESCE(w.state,'REQUESTED') name,count(*)::int count FROM project_requests r LEFT JOIN project_workflows w ON w.project_id=r.id WHERE ${scope} GROUP BY COALESCE(w.state,'REQUESTED') ORDER BY name`;
        const byOwner = await tx.$queryRaw<
          { id: string; name: string; count: number }[]
        >`SELECT u.id,u.name,count(*)::int count FROM project_requests r JOIN project_workflows w ON w.project_id=r.id JOIN users u ON u.id=w.owner_id WHERE ${scope} GROUP BY u.id,u.name ORDER BY count(*) DESC,u.name,u.id LIMIT 10`;
        const pending = await tx.$queryRaw<
          { n: number }[]
        >`SELECT count(*)::int n FROM project_requests r JOIN project_workflows w ON w.project_id=r.id JOIN project_plan_versions p ON p.id=(SELECT id FROM project_plan_versions WHERE project_id=r.id AND sealed ORDER BY version DESC LIMIT 1) JOIN project_plan_activities a ON a.plan_id=p.id JOIN project_activity_states s ON s.project_id=a.project_id AND s.logical_id=a.logical_id WHERE ${scope} AND w.state IN ('PLANNING','IN_PROGRESS') AND s.state<>'DONE'`;
        const monthly = await tx.$queryRaw<
          {
            month: string;
            requested: number;
            completed: number;
            canceled: number;
          }[]
        >`WITH source AS (SELECT r.created_at,w.completed_at,w.canceled_at FROM project_requests r LEFT JOIN project_workflows w ON w.project_id=r.id WHERE ${scope}), facts AS (SELECT created_at AS at_time,1 requested,0 completed,0 canceled FROM source UNION ALL SELECT completed_at,0,1,0 FROM source WHERE completed_at IS NOT NULL UNION ALL SELECT canceled_at,0,0,1 FROM source WHERE canceled_at IS NOT NULL) SELECT to_char(at_time AT TIME ZONE 'UTC','YYYY-MM') AS "month",sum(requested)::int requested,sum(completed)::int completed,sum(canceled)::int canceled FROM facts WHERE at_time>=date_trunc('month',CURRENT_TIMESTAMP)-interval '11 months' GROUP BY "month" ORDER BY "month"`;
        const ids = await tx.$queryRaw<
          { id: string }[]
        >`SELECT r.id FROM project_requests r LEFT JOIN project_workflows w ON w.project_id=r.id WHERE ${scope} ORDER BY r.created_at DESC,r.id DESC LIMIT 8`;
        const recent = [];
        for (const { id } of ids)
          recent.push(await this.view(tx, i, await this.row(tx, i, id), false));
        const updates = await tx.$queryRaw<
          {
            id: string;
            projectId: string;
            code: number;
            content: string;
            createdAt: Date;
          }[]
        >`SELECT v.id,r.id AS "projectId",r.code,v.content,v.created_at AS "createdAt" FROM project_workflow_updates v JOIN project_requests r ON r.id=v.project_id LEFT JOIN project_workflows w ON w.project_id=r.id WHERE ${scope} ORDER BY v.created_at DESC,v.id DESC LIMIT 8`;
        const history = await tx.$queryRaw<
          {
            projectId: string;
            code: number;
            percent: number | null;
            createdAt: Date;
          }[]
        >`SELECT r.id AS "projectId",r.code,(e.details->>'progressAfter')::int percent,e.created_at AS "createdAt" FROM project_workflow_events e JOIN project_requests r ON r.id=e.project_id JOIN project_workflows w ON w.project_id=r.id WHERE ${scope} AND e.kind IN ('PLAN_PUBLISHED','PLAN_REVISED','ACTIVITY_CHANGED','REWORK') ORDER BY e.created_at DESC,e.id DESC LIMIT 24`;
        return {
          ...count[0]!,
          pendingActivities: pending[0]!.n,
          byState,
          byOwner,
          monthly,
          recent,
          updates: updates.map((v) => ({
            ...v,
            createdAt: v.createdAt.toISOString(),
          })),
          progressHistory: history
            .reverse()
            .map((v) => ({ ...v, createdAt: v.createdAt.toISOString() })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
}
