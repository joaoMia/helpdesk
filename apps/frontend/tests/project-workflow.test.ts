import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  projectPlanSchema,
  projectMutationSchema,
  projectAssignmentSchema,
  projectPrioritySchema,
  createProjectSchema,
  projectWorkflowSchema,
} from '@helpdesk/contracts';
import { authDestination } from '../src/navigation/auth-routes';
import { createAuthClient } from '../src/lib/auth-client';
import {
  ProjectDetailActions,
  ProjectSummary,
} from '../src/pages/project-requests';
Object.assign(globalThis, { React });
const id = '10000000-0000-4000-8000-000000000001',
  stamp = '2026-11-06T12:00:00.000Z';
test('workflow recusa percentual manual, ordem inválida, identidade duplicada e excesso de atividades', () => {
  const activity = { title: 'Atividade válida', order: 1 };
  assert.equal(
    projectPlanSchema.safeParse({
      stages: [{ title: 'Etapa válida', order: 1, activities: [activity] }],
    }).success,
    true,
  );
  assert.equal(
    projectPlanSchema.safeParse({
      stages: [{ title: 'Etapa válida', order: 2, activities: [activity] }],
    }).success,
    false,
  );
  assert.equal(
    projectPlanSchema.safeParse({
      stages: [
        {
          id,
          title: 'Etapa válida',
          order: 1,
          activities: [{ ...activity, id }],
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    projectPlanSchema.safeParse({
      stages: [
        {
          title: 'Etapa válida',
          order: 1,
          activities: Array.from({ length: 201 }, (_, i) => ({
            ...activity,
            order: i + 1,
          })),
        },
      ],
    }).success,
    false,
  );
  assert.equal(
    projectMutationSchema.safeParse({
      expectedRevision: 1,
      clientOperationId: id,
      percent: 100,
    }).success,
    false,
  );
  assert.equal(
    projectAssignmentSchema.safeParse({
      expectedRevision: 1,
      clientOperationId: id,
      technicianId: id,
      reason: 'x',
    }).success,
    false,
  );
  assert.equal(
    projectPrioritySchema.safeParse({
      expectedRevision: 1,
      clientOperationId: id,
      priority: null,
      reason: 'Classificação inválida',
    }).success,
    false,
  );
});
test('criação exige chave de idempotência e recusa estado ou responsável injetado', () => {
  const p = {
    title: 'Projeto real',
    objective: 'Objetivo sintético',
    need: 'Necessidade sintética',
  };
  assert.equal(createProjectSchema.safeParse(p).success, false);
  assert.equal(
    createProjectSchema.safeParse({ ...p, clientOperationId: id }).success,
    true,
  );
  assert.equal(
    createProjectSchema.safeParse({
      ...p,
      clientOperationId: id,
      priority: 'HIGH',
    }).success,
    false,
  );
  assert.equal(
    createProjectSchema.safeParse({
      ...p,
      clientOperationId: id,
      state: 'COMPLETED',
    }).success,
    false,
  );
});
test('rotas dos três perfis abrem somente a própria área de projetos', () => {
  for (const [role, area] of [
    ['REQUESTER', 'requester'],
    ['TECHNICIAN', 'technician'],
    ['ADMIN', 'admin'],
  ] as const) {
    const u = {
      id,
      name: 'Teste',
      email: 'teste@example.invalid',
      role,
      mustChangePassword: false,
    };
    assert.equal(
      authDestination(u, '#/' + area + '/projetos'),
      '#/' + area + '/projetos',
    );
    assert.equal(
      authDestination(u, '#/' + area + '/projetos/' + id),
      '#/' + area + '/projetos/' + id,
    );
    assert.notEqual(
      authDestination(u, '#/' + area + '/projetos/' + id + '/extra'),
      '#/' + area + '/projetos/' + id + '/extra',
    );
  }
});
function workflowFixture() {
  return projectWorkflowSchema.parse({
    id,
    code: 1,
    title: 'Projeto real',
    objective: 'Objetivo sintético',
    need: 'Necessidade sintética',
    createdAt: stamp,
    state: 'REQUESTED',
    revision: 1,
    owner: null,
    startedAt: null,
    completedAt: null,
    canceledAt: null,
    progress: null,
    plan: null,
    draft: null,
    priority: null,
    permissions: {
      manage: false,
      assign: false,
      publish: false,
      execute: false,
      cancel: true,
      setPriority: false,
      retire: false,
    },
  });
}
test('cliente preserva chave de operação e revisão durante envio de workflow', async () => {
  const payloads: unknown[] = [];
  const workflow = workflowFixture();
  const json = (v: unknown) =>
    new Response(JSON.stringify(v), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  const c = createAuthClient(async (input, options) => {
    if (String(input).endsWith('/csrf')) return json({ csrfToken: 'ficticio' });
    payloads.push(JSON.parse(String(options?.body)));
    return json(workflow);
  });
  const body = {
    expectedRevision: 1,
    clientOperationId: id,
    reason: 'Pedido cancelado',
  };
  await c.projectWrite(id, 'cancel', body);
  await c.projectWrite(id, 'cancel', body);
  assert.deepEqual(payloads, [body, body]);
  assert.equal(
    projectWorkflowSchema.safeParse({ ...workflow, passwordHash: 'indevido' })
      .success,
    false,
  );
});

test('detalhe agrupa ações permitidas e exibe solicitante e progresso reais', () => {
  const workflow = {
    ...workflowFixture(),
    requesterName: 'Solicitante fictício',
    plan: { id, version: 2, createdAt: stamp, stages: [] },
    progress: { done: 1, total: 4, percent: 25 },
    state: 'IN_PROGRESS' as const,
  };
  const actions = (
    role: 'ADMIN' | 'TECHNICIAN' | 'REQUESTER',
    manager: boolean,
  ) =>
    renderToStaticMarkup(
      React.createElement(ProjectDetailActions, {
        workflow: {
          ...workflow,
          permissions: {
            ...workflow.permissions,
            manage: manager,
            execute: manager,
            setPriority: manager,
            retire: manager,
          },
        },
        role,
        busy: false,
        onEdit: () => {},
        onAction: () => {},
        onSection: () => {},
      }),
    );
  for (const role of ['ADMIN', 'TECHNICIAN'] as const) {
    const manager = actions(role, true);
    assert.match(
      manager,
      /Ações principais.*Editar plano.*Gerenciar etapas.*Concluir projeto/,
    );
    assert.match(
      manager,
      /Ações secundárias.*Visualizar versões.*Alterar prioridade.*Adicionar atualização.*Excluir projeto/,
    );
  }
  const requester = actions('REQUESTER', false);
  assert.match(requester, /Consultar planejamento.*Visualizar versões/);
  assert.doesNotMatch(
    requester,
    /Gerenciar etapas|Concluir projeto|Alterar prioridade|Excluir projeto/,
  );

  const summary = renderToStaticMarkup(
    React.createElement(ProjectSummary, { workflow }),
  );
  assert.match(summary, /Solicitante: Solicitante fictício/);
  assert.match(
    summary,
    /25%.*<progress[^>]+value="25".*1\/4 atividades.*plano v2/,
  );
  const legacy = renderToStaticMarkup(
    React.createElement(ProjectSummary, { workflow: workflowFixture() }),
  );
  assert.match(legacy, /Solicitante: Não informado/);
  assert.doesNotMatch(legacy, /<progress/);
});
