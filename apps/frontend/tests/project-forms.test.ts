import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient } from '../src/lib/auth-client';
import {
  createProjectSchema,
  projectSubmissionSchema,
  editableFormSchema,
} from '@helpdesk/contracts';
import {
  authDestination,
  isProjectRequestPath,
} from '../src/navigation/auth-routes';
const id = '00000000-0000-4000-8000-000000000001';
const fields = [
  { id, key: 'detail', label: 'Detalhe', type: 'TEXT', required: true },
];
test('submissão preserva contrato legado e snapshot; rejeita vínculo parcial, valores e propriedades privados', () => {
  const original = {
    title: 'Projeto',
    objective: 'Objetivo de exemplo',
    need: 'Necessidade de exemplo',
    clientOperationId: id,
  };
  assert.equal(createProjectSchema.safeParse(original).success, true);
  assert.equal(
    createProjectSchema.safeParse({
      ...original,
      form: { categoryId: id, answers: { detail: 'x' } },
    }).success,
    false,
  );
  const submitted = {
    categoryId: id,
    versionId: id,
    snapshot: {
      categoryName: 'Categoria',
      version: 1,
      title: 'Formulário',
      description: '',
      fields,
    },
    answers: { detail: 'Resposta' },
  };
  assert.equal(projectSubmissionSchema.safeParse(submitted).success, true);
  assert.equal(
    projectSubmissionSchema.safeParse({
      ...submitted,
      passwordHash: 'indevido',
    }).success,
    false,
  );
  assert.equal(projectSubmissionSchema.safeParse(null).success, true);
  assert.equal(
    editableFormSchema.safeParse({
      title: 'Inválido',
      description: '',
      fields: [
        { ...fields[0], condition: { field: 'inexistente', includes: 'sim' } },
      ],
    }).success,
    false,
  );
});
test('cliente envia categoria, versão, respostas e chave sem usar rotas de Chamados', async () => {
  assert.equal(isProjectRequestPath('#/admin/usuarios/projetos'), false);
  assert.equal(isProjectRequestPath('#/admin/projetos'), true);
  const sent: { url: string; body: unknown }[] = [];
  const client = createAuthClient(async (url, options) => {
    const value = String(url).endsWith('/csrf')
      ? { csrfToken: 'ficticio' }
      : {
          project: {
            id,
            code: 1,
            title: 'Projeto',
            objective: 'Objetivo de exemplo',
            need: 'Necessidade de exemplo',
            createdAt: '2026-11-08T12:00:00.000Z',
            priority: null,
          },
        };
    if (options?.body)
      sent.push({ url: String(url), body: JSON.parse(String(options.body)) });
    return new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });
  const input = {
    title: 'Projeto',
    objective: 'Objetivo de exemplo',
    need: 'Necessidade de exemplo',
    clientOperationId: id,
    form: { categoryId: id, versionId: id, answers: { detail: 'Valor' } },
  };
  await client.requestProject(input);
  assert.equal(sent.length, 1);
  assert.ok(sent[0]!.url.endsWith('/projects'));
  assert.deepEqual(sent[0]!.body, input);
  const user = {
    id,
    name: 'ADMIN sintético',
    email: 'admin@example.invalid',
    role: 'ADMIN' as const,
    mustChangePassword: false,
  };
  assert.equal(
    authDestination(user, '#/admin/usuarios/projetos'),
    '#/admin/usuarios/projetos',
  );
  assert.notEqual(
    authDestination(
      { ...user, role: 'REQUESTER' },
      '#/admin/usuarios/projetos',
    ),
    '#/admin/usuarios/projetos',
  );
});
