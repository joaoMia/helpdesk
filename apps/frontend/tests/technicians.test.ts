import test from 'node:test';
import assert from 'node:assert/strict';
import { authDestination } from '../src/navigation/auth-routes';
import { createAuthClient, AuthError } from '../src/lib/auth-client';
import {
  createTechnicianSchema,
  updateTechnicianSchema,
  technicianQuerySchema,
} from '@helpdesk/contracts';
const user = {
  id: '90000000-0000-4000-8000-000000000001',
  name: 'Teste',
  email: 'teste@example.invalid',
  role: 'ADMIN' as const,
  mustChangePassword: false,
};
const technician = {
  id: '90000000-0000-4000-8000-000000000002',
  name: 'Técnico teste',
  email: 'tech@example.invalid',
  isActive: true,
  mustChangePassword: true,
  createdAt: '2026-10-28T00:00:00.000Z',
  updatedAt: '2026-10-28T00:00:00.000Z',
};
test('gestão fica no ADMIN; técnico tem apenas navegação de perfil próprio', () => {
  assert.equal(authDestination(user, '#/admin/usuarios'), '#/admin/usuarios');
  assert.equal(
    authDestination({ ...user, role: 'REQUESTER' }, '#/admin/usuarios'),
    '#/requester/painel',
  );
  assert.equal(
    authDestination({ ...user, role: 'TECHNICIAN' }, '#/technician/perfil'),
    '#/technician/perfil',
  );
  assert.equal(
    authDestination({ ...user, mustChangePassword: true }, '#/admin/usuarios'),
    '#/change-password',
  );
});
test('contratos de técnicos recusam papel, atividade, hash e flags; paginação é limitada', () => {
  for (const key of [
    'role',
    'isActive',
    'passwordHash',
    'mustChangePassword',
  ]) {
    assert.equal(
      createTechnicianSchema.safeParse({
        name: 'Teste',
        email: 'teste@example.invalid',
        [key]: 'forged',
      }).success,
      false,
    );
    assert.equal(
      updateTechnicianSchema.safeParse({ name: 'Teste', [key]: 'forged' })
        .success,
      false,
    );
  }
  assert.equal(
    technicianQuerySchema.safeParse({ pageSize: 10000 }).success,
    false,
  );
  assert.equal(updateTechnicianSchema.safeParse({}).success, false);
});
test('cliente real separa criação com senha de detalhes e listagens sem senha', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const client = createAuthClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-only' });
    if (options?.method === 'POST')
      return Response.json(
        {
          technician,
          temporaryPassword: 'synthetic-test-not-credential-12345',
        },
        { status: 201 },
      );
    if (String(url).includes('?'))
      return Response.json({
        items: [technician],
        total: 1,
        page: 1,
        pageSize: 10,
      });
    return Response.json({ technician });
  });
  const result = await client.createTechnician({
    name: technician.name,
    email: technician.email,
  });
  assert.equal(typeof result.temporaryPassword === 'string', true);
  const detail = await client.technician(technician.id);
  assert.equal('temporaryPassword' in detail, false);
  const list = await client.technicians({
    page: 1,
    pageSize: 10,
    search: 'test@example.invalid',
  });
  assert.equal('temporaryPassword' in list.items[0]!, false);
  assert.equal(calls[1]!.options?.credentials, 'include');
  assert.equal(
    (calls[1]!.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'test-only',
  );
});
test('criação com falha de rede não é repetida, evitando perder a entrega única', async () => {
  let writes = 0;
  const client = createAuthClient(async (url) => {
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-only' });
    writes++;
    throw new Error('network test');
  });
  await assert.rejects(
    client.createTechnician({ name: technician.name, email: technician.email }),
    (e) => e instanceof AuthError && e.code === 'API_UNAVAILABLE',
  );
  assert.equal(writes, 1);
});
