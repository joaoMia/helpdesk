import test from 'node:test';
import assert from 'node:assert/strict';
import {
  overviewQuerySchema,
  overviewListSchema,
  assigneeListSchema,
  proposedAssignmentInputSchema,
} from '@helpdesk/contracts';
import { createAuthClient, AuthError } from '../src/lib/auth-client';
import { authDestination } from '../src/navigation/auth-routes';
const id = '90000000-0000-4000-8000-000000000001',
  instant = '2026-10-29T12:00:00.000Z';
const item = {
  id,
  code: 42,
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  createdAt: instant,
  responsibleName: 'João de Teste',
};
const page = { items: [item], total: 1, page: 1, pageSize: 10 };
test('visão operacional: contrato estrito exclui informações privadas e filtros privilegiados', () => {
  assert.deepEqual(overviewListSchema.parse(page), page);
  for (const key of [
    'subject',
    'description',
    'requesterId',
    'assignedTechnicianId',
    'serviceSnapshot',
    'answers',
    'events',
    'passwordHash',
  ])
    assert.equal(
      overviewListSchema.safeParse({
        ...page,
        items: [{ ...item, [key]: 'privado' }],
      }).success,
      false,
    );
  assert.equal(
    overviewQuerySchema.safeParse({
      search: 'J',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      page: 2,
    }).success,
    true,
  );
  for (const value of [
    { requesterId: id },
    { role: 'ADMIN' },
    { status: 'INVALID' },
    { pageSize: 100 },
  ])
    assert.equal(overviewQuerySchema.safeParse(value).success, false);
  assert.equal(
    overviewQuerySchema.safeParse({ status: 'RESOLVED' }).success,
    true,
  );
});
test('visão operacional: acesso por URL exige papel real e troca inicial concluída', () => {
  for (const role of ['REQUESTER', 'TECHNICIAN', 'ADMIN'] as const) {
    const user = {
      id,
      name: 'Teste',
      email: 'test@example.invalid',
      role,
      mustChangePassword: false,
    };
    assert.equal(
      authDestination(user, '#/admin/chamados'),
      role === 'ADMIN'
        ? '#/admin/chamados'
        : role === 'TECHNICIAN'
          ? '#/technician/painel'
          : '#/requester/painel',
    );
    assert.equal(
      authDestination(
        { ...user, mustChangePassword: true },
        '#/admin/chamados',
      ),
      '#/change-password',
    );
  }
  assert.equal(authDestination(null, '#/admin/chamados'), '#/login');
});
test('visão operacional: cliente mantém cookies, filtros e paginação no servidor', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const client = createAuthClient(async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(page);
  });
  assert.deepEqual(
    await client.overview({
      search: 'J',
      page: 2,
      status: 'IN_PROGRESS',
      priority: 'HIGH',
    }),
    page,
  );
  const url = new URL(calls[0]!.url, 'http://localhost');
  assert.equal(url.pathname, '/api/tickets/overview');
  assert.equal(url.searchParams.get('search'), 'J');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('status'), 'IN_PROGRESS');
  assert.equal(calls[0]!.options?.credentials, 'include');
});
test('destinatários: consulta mínima e proposta não permitem dados privilegiados', async () => {
  const result = {
    items: [{ id, name: 'João' }],
    total: 1,
    page: 1,
    pageSize: 10,
  };
  const client = createAuthClient(async (url) => {
    assert.match(String(url), /tickets\/assignees\?search=J/);
    return Response.json(result);
  });
  assert.deepEqual(await client.assignees({ search: 'J' }), result);
  assert.equal(
    assigneeListSchema.safeParse({
      ...result,
      items: [{ id, name: 'João', email: 'private@example.invalid' }],
    }).success,
    false,
  );
  assert.equal(
    proposedAssignmentInputSchema.safeParse({
      technicianId: id,
      expectedUpdatedAt: instant,
    }).success,
    true,
  );
  assert.equal(
    proposedAssignmentInputSchema.safeParse({
      technicianId: id,
      expectedUpdatedAt: instant,
      status: 'IN_PROGRESS',
    }).success,
    false,
  );
  assert.equal('assignTicket' in client, true);
});
test('visão operacional: falha de rede não é convertida em sucesso ou dados fictícios', async () => {
  const client = createAuthClient(async () => {
    throw new Error('network');
  });
  await assert.rejects(
    () => client.overview(),
    (e) => e instanceof AuthError && e.status === 0,
  );
});
