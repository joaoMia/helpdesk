import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  startTicketInputSchema,
  startedTicketSchema,
} from '@helpdesk/contracts';
import {
  authDestination,
  technicianTicketPage,
} from '../src/navigation/auth-routes';
import { createAuthClient, AuthError } from '../src/lib/auth-client';
import { RealTicketTable } from '../src/components/real-ticket-table';
const id = '90000000-0000-4000-8000-000000000001',
  owner = '90000000-0000-4000-8000-000000000002',
  createdAt = '2026-10-29T12:00:00.000Z';
const started = {
  id,
  code: 42,
  status: 'IN_PROGRESS',
  priority: 'MEDIUM',
  assignedTechnicianId: owner,
  firstStartedAt: createdAt,
};
test('atendimento: URLs exigem o perfil real e a troca inicial, sem conceder ownership', () => {
  for (const path of [
    '#/technician/atendimentos',
    '#/technician/chamado/' + id,
  ]) {
    assert.ok(technicianTicketPage(path));
    for (const role of ['ADMIN', 'REQUESTER', 'TECHNICIAN'] as const) {
      const user = {
        id: owner,
        name: 'Pessoa teste',
        email: 'teste@example.invalid',
        role,
        mustChangePassword: false,
      };
      assert.equal(
        authDestination(user, path),
        role === 'TECHNICIAN'
          ? path
          : role === 'ADMIN'
            ? '#/admin/painel'
            : '#/requester/painel',
      );
      assert.equal(
        authDestination({ ...user, mustChangePassword: true }, path),
        '#/change-password',
      );
      assert.equal(authDestination(null, path), '#/login');
    }
  }
  assert.equal(
    technicianTicketPage('#/technician/chamado/../../admin'),
    undefined,
  );
  assert.equal(
    technicianTicketPage('#/demo/technician/atendimentos'),
    undefined,
  );
});
test('atendimento: contrato não permite cliente escolher técnico, estado, data, prioridade ou serviço', () => {
  assert.deepEqual(startTicketInputSchema.parse({}), {});
  for (const bad of [
    { assignedTechnicianId: owner },
    { firstStartedAt: createdAt },
    { status: 'IN_PROGRESS' },
    { priority: 'HIGH' },
    { serviceId: id },
    { serviceSnapshot: {} },
    { requesterId: owner },
    { role: 'TECHNICIAN' },
  ])
    assert.equal(startTicketInputSchema.safeParse(bad).success, false);
  assert.equal(startedTicketSchema.safeParse(started).success, true);
  for (const bad of [
    { ...started, status: 'OPEN' },
    { ...started, assignedTechnicianId: null },
    { ...started, firstStartedAt: null },
    { ...started, priority: null },
  ])
    assert.equal(startedTicketSchema.safeParse(bad).success, false);
});
test('atendimento: cliente usa POST único, corpo vazio, cookies e CSRF; lista usa filtros da API', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const client = createAuthClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-only' });
    if (options?.method === 'POST') return Response.json({ ticket: started });
    return Response.json({ items: [], total: 0, page: 1, pageSize: 10 });
  });
  assert.equal((await client.startTicket(id)).assignedTechnicianId, owner);
  assert.equal(calls[1]!.url, '/api/tickets/' + id + '/start');
  assert.equal(calls[1]!.options?.method, 'POST');
  assert.equal(calls[1]!.options?.credentials, 'include');
  assert.equal(calls[1]!.options?.body, '{}');
  assert.equal(
    (calls[1]!.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'test-only',
  );
  await client.tickets({
    page: 1,
    status: 'IN_PROGRESS',
    priority: 'MEDIUM',
    search: 'HD-42',
  });
  assert.ok(calls[2]!.url.includes('status=IN_PROGRESS'));
  assert.ok(calls[2]!.url.includes('priority=MEDIUM'));
  assert.equal(calls[2]!.url.includes('assignedTechnicianId'), false);
});
test('atendimento: conflito, falha de rede e 5xx não repetem uma possível assunção', async () => {
  for (const status of [0, 409, 500]) {
    let writes = 0;
    const client = createAuthClient(async (url) => {
      if (String(url).endsWith('/csrf'))
        return Response.json({ csrfToken: 'test-only' });
      writes++;
      if (!status) throw new Error('network');
      return Response.json(
        { error: { code: 'TICKET_CONFLICT', message: 'Atualize a fila.' } },
        { status },
      );
    });
    await assert.rejects(
      client.startTicket(id),
      (e) => e instanceof AuthError && e.status === status,
    );
    assert.equal(writes, 1);
  }
});
test('atendimento: tabela reutilizada aponta para detalhes técnicos, sem ações não autorizadas', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'React');
  try {
    Object.defineProperty(globalThis, 'React', {
      configurable: true,
      value: React,
    });
    const technician = {
      id: owner,
      name: 'Técnico autenticado',
      email: 'tecnico@example.invalid',
      role: 'TECHNICIAN' as const,
      mustChangePassword: false,
    };
    const html = renderToStaticMarkup(
      React.createElement(RealTicketTable, {
        technician,
        tickets: [
          {
            id,
            code: 42,
            subject: 'Assunto persistido',
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            assignedTechnicianId: owner,
            serviceId: id,
            serviceName: 'Nome histórico',
            categoryName: 'Categoria histórica',
            createdAt,
            updatedAt: createdAt,
          },
        ],
      }),
    );
    for (const text of [
      'ticket-table',
      'ticket-link',
      'Técnico autenticado',
      'Nome histórico',
      '#/technician/chamado/' + id,
    ])
      assert.ok(html.includes(text));
    for (const text of [
      '#/requester/chamado/',
      'Encerrar',
      'Transferir',
      'Reabrir',
    ])
      assert.equal(html.includes(text), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'React', previous);
    else Reflect.deleteProperty(globalThis, 'React');
  }
});
