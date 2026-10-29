import test from 'node:test';
import assert from 'node:assert/strict';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Account } from '../src/pages/account';
import {
  categoryInputSchema,
  categoryUpdateSchema,
  serviceInputSchema,
  serviceUpdateSchema,
} from '@helpdesk/contracts';
import { createAuthClient, AuthError } from '../src/lib/auth-client';
import { authDestination } from '../src/navigation/auth-routes';
const id = '90000000-0000-4000-8000-000000000001';
const item = {
  id,
  name: 'Categoria teste',
  description: '',
  displayOrder: 0,
  isActive: true,
  createdAt: '2026-10-28T00:00:00.000Z',
  updatedAt: '2026-10-28T00:00:00.000Z',
};
test('DEV-008.1: menu e início exibem catálogo somente para ADMIN', () => {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  );
  const previousReact = Object.getOwnPropertyDescriptor(globalThis, 'React');
  try {
    // The root Node/tsx runner uses the classic JSX factory, unlike Vite.
    Object.defineProperty(globalThis, 'React', {
      configurable: true,
      value: React,
    });
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { hash: '#/admin/painel' } },
    });
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { documentElement: { dataset: { theme: 'light' } } },
    });
    for (const role of ['ADMIN', 'REQUESTER', 'TECHNICIAN'] as const) {
      const html = renderToStaticMarkup(
        createElement(Account, {
          user: {
            id,
            name: 'Teste',
            email: 'teste@example.invalid',
            role,
            mustChangePassword: false,
          },
          logout: () => {},
          busy: false,
          error: '',
        }),
      );
      assert.equal(html.includes('Catálogo de serviços'), role === 'ADMIN');
      assert.equal(html.includes('#/admin/catalogo'), role === 'ADMIN');
      assert.equal(html.includes('Catálogo disponível'), false);
      assert.equal(html.includes('#/requester/catalogo'), false);
      assert.equal(html.includes('#/technician/catalogo'), false);
    }
  } finally {
    if (previousReact)
      Object.defineProperty(globalThis, 'React', previousReact);
    else Reflect.deleteProperty(globalThis, 'React');
    if (previousWindow)
      Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (previousDocument)
      Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  }
});
test('catálogo: criação tem defaults; edição parcial não reativa nem apaga descrição/ordem', () => {
  assert.deepEqual(categoryInputSchema.parse({ name: 'Teste' }), {
    name: 'Teste',
    description: '',
    isActive: true,
    displayOrder: 0,
  });
  assert.deepEqual(categoryUpdateSchema.parse({ name: 'Alterado' }), {
    name: 'Alterado',
  });
  assert.deepEqual(serviceUpdateSchema.parse({ isActive: false }), {
    isActive: false,
  });
  assert.equal(
    serviceInputSchema.safeParse({ name: 'Teste', categoryId: 'invalid' })
      .success,
    false,
  );
  assert.equal(categoryUpdateSchema.safeParse({}).success, false);
});
test('catálogo: nenhum contrato aceita preço/cobrança, campos de formulário ou papel', () => {
  for (const key of ['price', 'billing', 'role', 'fields', 'forms']) {
    assert.equal(
      categoryInputSchema.safeParse({ name: 'Teste', [key]: true }).success,
      false,
    );
    assert.equal(
      serviceInputSchema.safeParse({
        name: 'Teste',
        categoryId: id,
        [key]: true,
      }).success,
      false,
    );
    assert.equal(
      serviceUpdateSchema.safeParse({ name: 'Teste', [key]: true }).success,
      false,
    );
  }
});
test('catálogo: rota corresponde ao perfil autenticado e troca de senha precede consulta', () => {
  for (const role of ['REQUESTER', 'TECHNICIAN', 'ADMIN'] as const) {
    const user = {
      id,
      name: 'Teste',
      email: 'teste@example.invalid',
      role,
      mustChangePassword: false,
    };
    const path = `#/${role === 'ADMIN' ? 'admin' : role === 'TECHNICIAN' ? 'technician' : 'requester'}/catalogo`;
    assert.equal(
      authDestination(user, path),
      role === 'ADMIN'
        ? path
        : role === 'TECHNICIAN'
          ? '#/technician/painel'
          : '#/requester/painel',
    );
    for (const oldPath of ['#/requester/catalogo', '#/technician/catalogo']) {
      assert.equal(
        authDestination(user, oldPath),
        role === 'ADMIN'
          ? '#/admin/painel'
          : role === 'TECHNICIAN'
            ? '#/technician/painel'
            : '#/requester/painel',
      );
    }
    assert.notEqual(
      authDestination(
        user,
        role === 'ADMIN' ? '#/requester/catalogo' : '#/admin/catalogo',
      ),
      role === 'ADMIN' ? '#/requester/catalogo' : '#/admin/catalogo',
    );
    assert.equal(
      authDestination({ ...user, mustChangePassword: true }, path),
      '#/change-password',
    );
  }
});
test('catálogo: cliente usa consulta paginada real, cookies e escrita com CSRF', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const client = createAuthClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-only' });
    if (options?.method === 'POST' || options?.method === 'PATCH')
      return Response.json(
        { item },
        { status: options.method === 'POST' ? 201 : 200 },
      );
    return Response.json({ items: [item], total: 1, page: 2, pageSize: 10 });
  });
  assert.equal(
    (await client.categories({ page: 2, pageSize: 10, search: 'Teste' })).page,
    2,
  );
  assert.ok(calls[0]!.url.startsWith('/api/categories?'));
  assert.ok(calls[0]!.url.includes('search=Teste'));
  assert.equal(calls[0]!.options?.credentials, 'include');
  assert.equal(
    (
      await client.createCategory({
        name: 'Teste',
        description: '',
        isActive: true,
        displayOrder: 0,
      })
    ).id,
    id,
  );
  assert.equal(
    (calls[2]!.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'test-only',
  );
  assert.equal(calls[2]!.options?.cache, 'no-store');
  await client.updateCategory(id, { isActive: false });
  assert.equal(calls[4]!.options?.method, 'PATCH');
  assert.equal(calls[4]!.options?.body, JSON.stringify({ isActive: false }));
});
test('catálogo: falha de rede não repete criação automaticamente', async () => {
  let writes = 0;
  const client = createAuthClient(async (url) => {
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-only' });
    writes++;
    throw new Error('network');
  });
  await assert.rejects(
    client.createService({
      categoryId: id,
      name: 'Teste',
      description: '',
      isActive: true,
      displayOrder: 0,
    }),
    (e) => e instanceof AuthError && e.code === 'API_UNAVAILABLE',
  );
  assert.equal(writes, 1);
});
