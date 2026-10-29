import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyPrioritySchema,
  triageQuerySchema,
  triageListSchema,
} from '@helpdesk/contracts';
import {
  authDestination,
  technicianTriageQueue,
} from '../src/navigation/auth-routes';
import { createAuthClient, AuthError } from '../src/lib/auth-client';
const id = '90000000-0000-4000-8000-000000000001';
const row = {
  id,
  code: 123,
  status: 'OPEN',
  priority: null,
  createdAt: '2026-10-29T12:00:00.000Z',
};

test('triagem: rotas dependem do técnico autenticado; troca inicial tem precedência', () => {
  for (const path of [
    '#/technician/chamados/nao-classificados',
    '#/technician/chamados/classificados',
    '#/technician/chamados/todos',
  ]) {
    assert.ok(technicianTriageQueue(path));
    for (const role of ['ADMIN', 'REQUESTER', 'TECHNICIAN'] as const) {
      const user = {
        id,
        name: 'Teste',
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
    technicianTriageQueue('#/demo/technician/chamados/todos'),
    undefined,
  );
});
test('triagem: contratos limitam filtros, projeção e classificação sem aceitar atribuição/status', () => {
  assert.deepEqual(triageQuerySchema.parse({}), {
    queue: 'UNCLASSIFIED',
    page: 1,
    pageSize: 10,
    search: '',
  });
  for (const bad of [
    { search: 'assunto privado' },
    { search: '2147483648' },
    { queue: 'CLOSED' },
    { requesterId: id },
    { pageSize: 100 },
    { status: 'CLASSIFIED' },
  ])
    assert.equal(triageQuerySchema.safeParse(bad).success, false);
  for (const bad of [
    { priority: 'LOW' },
    { priority: null, expectedPriority: null },
    { priority: 'HIGH', expectedPriority: null, assignedTechnicianId: id },
    { priority: 'LOW', expectedPriority: null, role: 'TECHNICIAN' },
  ])
    assert.equal(classifyPrioritySchema.safeParse(bad).success, false);
  for (const priority of ['LOW', 'MEDIUM', 'HIGH'])
    assert.equal(
      classifyPrioritySchema.safeParse({ priority, expectedPriority: null })
        .success,
      true,
    );
  assert.equal(
    triageListSchema.safeParse({
      items: [{ ...row, description: 'privado' }],
      total: 1,
      page: 1,
      pageSize: 10,
    }).success,
    false,
  );
});
test('triagem: cliente usa filtros do servidor, cookies, CSRF e prioridade observada', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const client = createAuthClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-only' });
    if (options?.method === 'PATCH')
      return Response.json({ ticket: { ...row, priority: 'LOW' } });
    return Response.json({ items: [row], total: 1, page: 1, pageSize: 10 });
  });
  assert.equal(
    (await client.triage({ queue: 'ALL', search: 'HD-123' })).items[0]!.code,
    123,
  );
  assert.ok(
    calls[0]!.url.includes('/api/tickets/triage?queue=ALL&search=HD-123'),
  );
  const result = await client.classifyPriority(id, {
    priority: 'LOW',
    expectedPriority: null,
  });
  assert.equal(result.priority, 'LOW');
  assert.equal(calls[2]!.url, '/api/tickets/' + id + '/priority');
  assert.equal(calls[2]!.options?.credentials, 'include');
  assert.equal(
    (calls[2]!.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'test-only',
  );
  assert.deepEqual(JSON.parse(calls[2]!.options?.body as string), {
    priority: 'LOW',
    expectedPriority: null,
  });
});
test('triagem: conflito e falha de transporte não repetem PATCH nem anunciam sucesso', async () => {
  for (const network of [false, true]) {
    let writes = 0;
    const client = createAuthClient(async (url) => {
      if (String(url).endsWith('/csrf'))
        return Response.json({ csrfToken: 'test-only' });
      writes++;
      if (network) throw new Error('network');
      return Response.json(
        { error: { code: 'TICKET_CONFLICT', message: 'Atualize a fila.' } },
        { status: 409 },
      );
    });
    await assert.rejects(
      client.classifyPriority(id, { priority: 'HIGH', expectedPriority: null }),
      (e) =>
        e instanceof AuthError &&
        e.code === (network ? 'API_UNAVAILABLE' : 'TICKET_CONFLICT'),
    );
    assert.equal(writes, 1);
  }
});
