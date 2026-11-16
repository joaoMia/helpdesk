import React from 'react';
Object.assign(globalThis, { React });
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  editableFormSchema,
  serviceFormSchema,
  createTicketHttpSchema,
} from '@helpdesk/contracts';
import { DynamicServiceFields } from '../src/components/dynamic-service-fields';
const id = '11111111-1111-4111-8111-111111111111';
test('formulários: prévia renderiza tipos e condições reais sem executar definições', () => {
  const fields = [
    {
      id,
      key: 'system',
      label: 'Sistema',
      type: 'SELECT' as const,
      required: true,
      options: ['TOTVS', 'Spark'],
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      key: 'module',
      label: 'Módulo',
      type: 'TEXT' as const,
      required: true,
      condition: { field: 'system', includes: 'TOTVS' },
      help: 'Informe o módulo',
    },
  ];
  const render = (answers: Record<string, string>) =>
    renderToStaticMarkup(
      React.createElement(DynamicServiceFields, {
        fields,
        answers,
        onChange: () => {},
      }),
    );
  assert.doesNotMatch(render({ system: 'Spark' }), /Módulo/);
  assert.match(render({ system: 'TOTVS' }), /Módulo/);
  assert.match(render({ system: 'TOTVS' }), /Informe o módulo/);
  assert.equal(
    editableFormSchema.safeParse({
      title: 'Formulário',
      description: '',
      fields,
    }).success,
    true,
  );
  assert.equal(
    editableFormSchema.safeParse({
      title: 'Formulário',
      description: '',
      fields: [fields[1], fields[0]],
    }).success,
    false,
  );
});
test('contratos reais aceitam campos numéricos e versões, sem aceitar identidade ou estado no payload', () => {
  assert.equal(
    createTicketHttpSchema.safeParse({
      serviceId: id,
      formVersionId: id,
      subject: 'Teste',
      description: 'Teste',
      answers: { quantity: 2 },
    }).success,
    true,
  );
  assert.equal(
    createTicketHttpSchema.safeParse({
      serviceId: id,
      subject: 'Teste',
      description: 'Teste',
      requesterId: id,
    }).success,
    false,
  );
  assert.equal(
    serviceFormSchema.safeParse({
      published: null,
      draft: {
        revision: 1,
        published: false,
        definition: { title: 'Rascunho', description: '', fields: [] },
      },
      versions: [],
    }).success,
    true,
  );
});
import {
  makeServiceFormTemplate,
  serviceFormTemplates,
} from '../src/lib/service-form-templates';
test('modelos de referência geram somente definições válidas para rascunho e incluem motivo da instalação', () => {
  for (const template of serviceFormTemplates)
    assert.equal(
      editableFormSchema.safeParse(makeServiceFormTemplate(template.id))
        .success,
      true,
      template.name,
    );
  assert.ok(
    makeServiceFormTemplate('s2').fields.some(
      (f) => f.label === 'Motivo da instalação',
    ),
  );
});
import { openingPayload } from '../src/lib/opening-payload';
test('confirmação conserva respostas e versão exibidas na revisão, sem reenviar campos ocultos', () => {
  const fields = [
    {
      id,
      key: 'app',
      label: 'Aplicativo',
      type: 'TEXT' as const,
      required: true,
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      key: 'detail',
      label: 'Detalhe',
      type: 'TEXT' as const,
      required: true,
      condition: { field: 'app', includes: 'Outro' },
    },
  ];
  const result = openingPayload(
    {
      serviceId: id,
      formVersionId: id,
      subject: 'Instalação',
      description: 'Motivo',
      answers: { app: 'Editor', detail: 'Resposta antiga oculta' },
    },
    fields,
  );
  assert.ok(result.success);
  assert.deepEqual(result.data.answers, { app: 'Editor' });
  assert.equal(result.data.formVersionId, id);
});
