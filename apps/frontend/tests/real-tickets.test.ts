import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTicketHttpSchema, ticketQuerySchema } from '@helpdesk/contracts';
import {
  authDestination,
  requesterTicketPage,
} from '../src/navigation/auth-routes';
import { createAuthClient, AuthError } from '../src/lib/auth-client';
import { RealTicketTable } from '../src/components/real-ticket-table';
const id = '90000000-0000-4000-8000-000000000001',
  serviceId = '90000000-0000-4000-8000-000000000002',
  formId = '90000000-0000-4000-8000-000000000003',
  createdAt = '2026-10-29T12:00:00.000Z';
const snapshot = {
  schemaVersion: 1,
  serviceId,
  serviceName: 'Serviço persistido',
  serviceDescription: 'Descrição',
  categoryId: id,
  categoryName: 'Categoria persistida',
  formVersionId: formId,
  formVersion: 1,
  fields: [],
};
const ticket = {
  id,
  code: 42,
  subject: 'Assunto real',
  status: 'OPEN',
  priority: null,
  assignedTechnicianId: null,
  serviceId,
  serviceName: 'Serviço persistido',
  categoryName: 'Categoria persistida',
  createdAt,
  updatedAt: createdAt,
};
test('rotas reais pertencem somente ao solicitante e não liberam perfil por URL', () => {
  for (const role of ['REQUESTER', 'TECHNICIAN', 'ADMIN'] as const) {
    const user = {
      id,
      name: 'Pessoa teste',
      email: 'pessoa@example.invalid',
      role,
      mustChangePassword: false,
    };
    for (const path of [
      '#/requester/novo',
      '#/requester/chamados',
      `#/requester/chamado/${id}`,
    ]) {
      assert.equal(
        authDestination(user, path),
        role === 'REQUESTER'
          ? path
          : role === 'TECHNICIAN'
            ? '#/technician/painel'
            : '#/admin/painel',
      );
      assert.equal(
        authDestination({ ...user, mustChangePassword: true }, path),
        '#/change-password',
      );
      assert.equal(authDestination(null, path), '#/login');
    }
  }
  assert.equal(requesterTicketPage('#/requester/chamado/../admin'), undefined);
  assert.equal(requesterTicketPage('#/demo/requester/novo'), undefined);
});
test('contrato de abertura real aceita um serviço e não aceita identidade, técnico, horários ou múltiplos serviços', () => {
  const input = { serviceId, subject: ' Assunto ', description: ' Descrição ' };
  assert.deepEqual(createTicketHttpSchema.parse(input), {
    ...input,
    subject: 'Assunto',
    description: 'Descrição',
    answers: {},
  });
  for (const extra of [
    { serviceIds: [serviceId, serviceId] },
    { requesterId: id },
    { assignedTechnicianId: id },
    { status: 'CLOSED' },
    { priority: 'HIGH' },
    { price: 12 },
    { serviceSnapshot: snapshot },
    { scheduledAt: createdAt },
    { answers: { campo: 'extra' } },
  ])
    assert.equal(
      createTicketHttpSchema.safeParse({ ...input, ...extra }).success,
      false,
    );
  assert.equal(
    createTicketHttpSchema.safeParse({ ...input, subject: ' ' }).success,
    false,
  );
  assert.equal(ticketQuerySchema.safeParse({ requesterId: id }).success, false);
});
test('API cliente abre com cookies/CSRF e lê lista, detalhes e histórico reais', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const client = createAuthClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-only' });
    if (options?.method === 'POST')
      return Response.json(
        {
          ticket: {
            id,
            code: 42,
            status: 'OPEN',
            priority: null,
            assignedTechnicianId: null,
            createdAt,
            serviceSnapshot: snapshot,
          },
        },
        { status: 201 },
      );
    if (String(url).includes('/history?'))
      return Response.json({
        items: [{ id, actorId: id, eventType: 'OPENED', createdAt }],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    if (String(url).includes('?'))
      return Response.json({
        items: [ticket],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    return Response.json({
      ticket: {
        ...ticket,
        requesterId: id,
        description: 'Descrição',
        formVersionId: formId,
        serviceSnapshot: snapshot,
        firstStartedAt: null,
        closedAt: null,
        answers: [],
      },
    });
  });
  assert.equal(
    (
      await client.createTicket({
        serviceId,
        subject: 'Assunto',
        description: 'Descrição',
        answers: {},
      })
    ).id,
    id,
  );
  assert.equal(calls[1]!.url, '/api/tickets');
  assert.equal(calls[1]!.options?.credentials, 'include');
  assert.equal(
    (calls[1]!.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'test-only',
  );
  assert.equal(
    (await client.tickets({ status: 'OPEN', priority: 'NONE' })).total,
    1,
  );
  assert.ok(calls[2]!.url.includes('priority=NONE'));
  assert.equal(
    (await client.ticket(id)).serviceSnapshot.serviceName,
    'Serviço persistido',
  );
  assert.equal((await client.ticketHistory(id)).items[0]!.eventType, 'OPENED');
});
test('falhas de rede não repetem abertura nem geram sucesso falso', async () => {
  let writes = 0;
  const client = createAuthClient(async (url) => {
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-only' });
    writes++;
    throw new Error('network');
  });
  await assert.rejects(
    client.createTicket({
      serviceId,
      subject: 'Assunto',
      description: 'Descrição',
      answers: {},
    }),
    (e) => e instanceof AuthError && e.code === 'API_UNAVAILABLE',
  );
  assert.equal(writes, 1);
});
test('tabela real reutiliza composição visual aprovada e usa número, link e nome vindos da API', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React');
  try {
    Object.defineProperty(globalThis, 'React', {
      configurable: true,
      value: React,
    });
    const html = renderToStaticMarkup(
      React.createElement(RealTicketTable, {
        tickets: [
          ticket as Parameters<typeof RealTicketTable>[0]['tickets'][number],
        ],
      }),
    );
    for (const value of [
      'ticket-table',
      'ticket-link',
      'HD-42',
      `#/requester/chamado/${id}`,
      'Serviço persistido',
      'Sem responsável',
    ])
      assert.ok(html.includes(value));
    assert.equal(html.includes('fictícios'), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'React', previous);
    else Reflect.deleteProperty(globalThis, 'React');
  }
});
