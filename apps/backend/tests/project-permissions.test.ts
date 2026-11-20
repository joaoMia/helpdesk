import { randomBytes, randomUUID } from 'node:crypto';
import { expect, it } from '@jest/globals';
import request from 'supertest';
import type { UserRole } from '@helpdesk/contracts';
import { createApp } from '../src/app.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { authConfig } from '../src/modules/auth/auth.config.js';
import { AuthRepository } from '../src/modules/auth/auth.repository.js';
import { authRuntime } from '../src/modules/auth/auth.routes.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { ProjectRepository } from '../src/modules/projects/project.repository.js';
import { ProjectService } from '../src/modules/projects/project.service.js';

const origin = 'http://127.0.0.1:5173';

async function fixture(role: UserRole, ownsProject: boolean, done = true) {
  const user = {
    id: randomUUID(),
    name: 'Pessoa fictícia',
    email: 'projetos@example.invalid',
    role,
    isActive: true,
    mustChangePassword: false,
  };
  const session = {
    id: randomUUID(),
    userId: user.id,
    user,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };
  const owner = {
    id: ownsProject ? user.id : randomUUID(),
    name: 'Responsável',
  };
  const now = new Date();
  const row = {
    id: randomUUID(),
    code: 1,
    requester_id: role === 'REQUESTER' ? user.id : randomUUID(),
    requester_name: 'Solicitante',
    title: 'Projeto sintético',
    objective: 'Objetivo para teste',
    need: 'Necessidade para teste',
    priority: null,
    created_at: now,
    state: 'IN_PROGRESS',
    revision: 1,
    owner_id: owner.id,
    owner_name: owner.name,
    started_at: now,
    completed_at: null as Date | null,
    canceled_at: null,
  };
  const planId = randomUUID(),
    stageId = randomUUID(),
    activityId = randomUUID();
  const events: { actorId: unknown; kind: unknown }[] = [];
  const retirements: { actorId: string; projectId: string; reason: string }[] =
    [];
  const persistence = {
    async $queryRaw(query: TemplateStringsArray, ...args: unknown[]) {
      const sql = query.join('?');
      if (sql.startsWith('SELECT r.*')) {
        const scope = args[1] as { text: string; values: string[] };
        if (retirements.length) return [];
        if (
          scope.text.includes('w.owner_id=') &&
          scope.values[0] !== row.owner_id
        )
          return [];
        if (
          scope.text.includes('r.requester_id=') &&
          scope.values[0] !== row.requester_id
        )
          return [];
        return [row];
      }
      if (sql.includes('FROM project_plan_versions'))
        return [{ id: planId, version: 1, created_at: now }];
      if (sql.includes('FROM project_plan_stages'))
        return [
          {
            id: stageId,
            logical_id: stageId,
            title: 'Etapa',
            description: '',
            position: 1,
          },
        ];
      if (sql.includes('FROM project_plan_activities'))
        return [
          {
            logical_id: activityId,
            stage_id: stageId,
            title: 'Atividade',
            description: '',
            position: 1,
            state: done ? 'DONE' : 'TODO',
          },
        ];
      if (
        sql.startsWith('SELECT id FROM ') ||
        sql.includes('FROM project_operations') ||
        sql.includes('FROM project_workflow_events') ||
        sql.includes('FROM project_plan_drafts')
      )
        return [];
      throw new Error('Consulta inesperada no teste de permissões.');
    },
    async $executeRaw(query: TemplateStringsArray, ...args: unknown[]) {
      const sql = query.join('?');
      if (sql.startsWith('UPDATE project_workflows')) {
        row.state = String(args[0]);
        row.completed_at = args[3] as Date | null;
        row.revision++;
      } else if (sql.startsWith('INSERT INTO project_workflow_events')) {
        events.push({ actorId: args[1], kind: args[2] });
      } else if (
        !sql.startsWith('INSERT INTO project_workflows') &&
        !sql.startsWith('INSERT INTO project_operations')
      )
        throw new Error('Escrita inesperada no teste de permissões.');
      return 1;
    },
    user: { findUnique: async () => user, findFirst: async () => owner },
    authSession: { findUnique: async () => session },
    operationalRetirement: {
      create: async ({ data }: { data: (typeof retirements)[number] }) => {
        retirements.push(data);
      },
    },
  };
  const db = {
    ...persistence,
    $transaction: async (run: (tx: typeof persistence) => unknown) =>
      run(persistence),
  } as unknown as PrismaClient;
  const auth = new AuthService(
    new AuthRepository(db),
    authConfig(
      {
        AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
        AUTH_CSRF_SECRET: randomBytes(32).toString('base64url'),
        AUTH_ORIGINS: origin,
        AUTH_ALLOW_LOCAL_HTTP: 'true',
        AUTH_COOKIE_SECURE: 'false',
      },
      'test',
    ),
  );
  const app = createApp(
    authRuntime(auth),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    new ProjectService(new ProjectRepository(db)),
  );
  const agent = request(app);
  const token = await auth.signAccess(user.id, session.id);
  const csrf = await agent.get('/auth/csrf').set('Origin', origin);
  const cookies = (csrf.headers['set-cookie'] as unknown as string[]).map(
    (cookie) => cookie.split(';', 1)[0],
  );
  const cookie = [...cookies, 'helpdesk.access=' + token].join('; ');
  const base = '/projects/' + row.id + '/';
  return {
    actorId: user.id,
    row,
    events,
    retirements,
    read: () => agent.get(base + 'workflow').set('Cookie', cookie),
    write: (operation: 'complete' | 'retire') =>
      agent
        .post(base + operation)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf.body.csrfToken)
        .send({
          expectedRevision: 1,
          clientOperationId: randomUUID(),
          reason: 'Justificativa do teste',
        }),
  };
}

it('solicitante não recebe autorização operacional mesmo com vínculo inconsistente', async () => {
  const f = await fixture('REQUESTER', true);
  const response = await f.read();
  expect(response.status).toBe(200);
  expect(response.body.permissions).toMatchObject({
    execute: false,
    retire: false,
  });
});

it.each([
  ['REQUESTER', false, 403],
  ['TECHNICIAN', false, 404],
  ['TECHNICIAN', true, 200],
  ['ADMIN', false, 200],
] as const)(
  '%s com vínculo %s tem status %i nas duas operações',
  async (role, owner, status) => {
    for (const operation of ['complete', 'retire'] as const) {
      const f = await fixture(role, owner);
      const response = await f.write(operation);
      expect(response.status).toBe(status);
      if (status !== 200) {
        expect(f.events).toHaveLength(0);
        expect(f.retirements).toHaveLength(0);
        expect(f.row.revision).toBe(1);
      } else if (operation === 'complete') {
        expect(response.body).toMatchObject({
          state: 'COMPLETED',
          revision: 2,
        });
        expect(f.events).toEqual([{ actorId: f.actorId, kind: 'COMPLETED' }]);
      } else {
        expect(f.retirements).toEqual([
          {
            actorId: f.actorId,
            projectId: f.row.id,
            reason: 'Justificativa do teste',
          },
        ]);
        expect(f.events).toEqual([{ actorId: f.actorId, kind: 'RETIRED' }]);
        expect((await f.read()).status).toBe(404);
      }
    }
  },
);

it('técnico responsável precisa concluir as atividades antes de concluir o projeto', async () => {
  const f = await fixture('TECHNICIAN', true, false);
  const response = await f.write('complete');
  expect(response.status).toBe(409);
  expect(f.events).toHaveLength(0);
  expect(f.row.state).toBe('IN_PROGRESS');
});
