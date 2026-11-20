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
    owner: { id, name: 'Técnico fictício' },
    startedAt: stamp,
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
        user: { id, role },
        workflow: {
          ...workflow,
          permissions: {
            ...workflow.permissions,
            assign: role === 'ADMIN',
            cancel: role === 'ADMIN',
            manage: manager,
            execute: manager,
            setPriority: manager,
            retire: manager,
          },
        },
        busy: false,
        onEdit: () => {},
        onAction: () => {},
        onSection: () => {},
        onRefresh: () => {},
      }),
    );
  for (const role of ['ADMIN', 'TECHNICIAN'] as const) {
    const manager = actions(role, true);
    assert.match(manager, /Ações principais.*Concluir projeto.*Editar plano/);
    assert.match(
      manager,
      /Acompanhamento do projeto.*Gerenciar etapas.*Histórico.*Alterar prioridade.*Atualizar consulta.*Excluir projeto/,
    );
    assert.match(
      manager,
      /class="button-secondary col-span-full"[^>]*>.*Excluir projeto/,
    );
    assert.doesNotMatch(
      manager,
      /Consultar planejamento|Atualizações|Adicionar atualização|Versões|Iniciar planejamento/,
    );
    assert.equal(manager.match(/Gerenciar etapas/g)?.length, 1);
  }
  const requester = actions('REQUESTER', false);
  assert.match(
    requester,
    /Consultar planejamento.*Histórico.*Atualizar consulta/,
  );
  assert.doesNotMatch(
    requester,
    /Gerenciar etapas|Concluir projeto|Alterar prioridade|Excluir projeto/,
  );

  const summary = renderToStaticMarkup(
    React.createElement(ProjectSummary, { workflow }),
  );
  assert.match(summary, /<dt>Solicitante<\/dt><dd>Solicitante fictício<\/dd>/);
  assert.match(
    summary,
    /<dt>Responsável técnico<\/dt><dd>Técnico fictício<\/dd>/,
  );
  assert.match(summary, /<dt>Data de início<\/dt><dd><time datetime=/i);
  assert.match(
    summary,
    /25%.*<progress[^>]+value="25".*1\/4 atividades.*plano v2/,
  );
  const legacy = renderToStaticMarkup(
    React.createElement(ProjectSummary, { workflow: workflowFixture() }),
  );
  assert.match(legacy, /<dt>Solicitante<\/dt><dd>Não informado<\/dd>/);
  assert.doesNotMatch(legacy, /Data de início|Data de conclusão/);
  assert.doesNotMatch(legacy, /<progress/);
});

test('projeto atribuído permite criar plano nos estados legado e em planejamento, conforme permissões', () => {
  for (const state of ['REQUESTED', 'PLANNING'] as const) {
    for (const canManage of [false, true]) {
      const workflow = workflowFixture();
      const html = renderToStaticMarkup(
        React.createElement(ProjectDetailActions, {
          user: { id, role: 'TECHNICIAN' },
          workflow: {
            ...workflow,
            state,
            owner: { id, name: 'Técnico fictício' },
            permissions: {
              ...workflow.permissions,
              manage: canManage,
              publish: canManage,
              assign: false,
            },
          },
          busy: false,
          onEdit: () => {},
          onAction: () => {},
          onSection: () => {},
          onRefresh: () => {},
        }),
      );
      assert.equal(html.includes('Criar plano'), canManage);
      assert.doesNotMatch(
        html,
        /Iniciar planejamento|Iniciar execução|Definir responsável/,
      );
    }
  }
});

test('concluir e excluir exigem perfil e vínculo além das permissões do projeto', () => {
  const anotherId = '10000000-0000-4000-8000-000000000002';
  const workflow = workflowFixture();
  for (const [role, userId, allowed] of [
    ['REQUESTER', id, false],
    ['TECHNICIAN', anotherId, false],
    ['TECHNICIAN', id, true],
    ['ADMIN', anotherId, true],
  ] as const) {
    const html = renderToStaticMarkup(
      React.createElement(ProjectDetailActions, {
        user: { id: userId, role },
        workflow: {
          ...workflow,
          owner: { id, name: 'Responsável' },
          state: 'IN_PROGRESS',
          permissions: { ...workflow.permissions, execute: true, retire: true },
        },
        busy: false,
        onEdit: () => {},
        onAction: () => {},
        onSection: () => {},
        onRefresh: () => {},
      }),
    );
    assert.equal(html.includes('Concluir projeto'), allowed, role);
    assert.equal(html.includes('Excluir projeto'), allowed, role);
    assert.match(html, /Histórico.*Atualizar consulta/);
  }
});
