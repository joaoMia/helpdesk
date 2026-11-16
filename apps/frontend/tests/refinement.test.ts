import React from 'react';
Object.assign(globalThis, { React });
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadAllOptions } from '../src/lib/paginated-options';
import { mergeMessages, chatWritable } from '../src/lib/chat-messages';
import { OrganizationPicker } from '../src/components/organization-picker';
import { Administration } from '../src/pages/administration';
import { Profile } from '../src/pages/profile';
import { initialCatalog } from '../src/mocks/catalog';
import { authDestination } from '../src/navigation/auth-routes';
const user = {
  id: '90000000-0000-4000-8000-000000000001',
  name: 'Teste',
  email: 'test@example.invalid',
  role: 'ADMIN' as const,
  mustChangePassword: false,
};
test('seletores carregam todas as páginas sem expor paginação e ignoram carga cancelada', async () => {
  const pages: number[] = [];
  const result = await loadAllOptions(async (page) => {
    pages.push(page);
    return { items: [{ id: String(page) }], total: 3, pageSize: 1 };
  });
  assert.equal(result.length, 3);
  assert.deepEqual(pages, [1, 2, 3]);
  assert.deepEqual(
    await loadAllOptions(
      async () => {
        throw Error('não deve chamar');
      },
      () => true,
    ),
    [],
  );
  const html = renderToStaticMarkup(
    React.createElement(OrganizationPicker, {
      kind: 'companies',
      label: 'Empresa',
      value: null,
      onChange: () => {},
      onExpired: () => {},
    }),
  );
  assert.match(html, /<select/);
  assert.doesNotMatch(html, /Pesquisar|Anterior|Próxima|Página|type="search"/);
});
test('chat ordena e deduplica mensagens e bloqueia escrita em RESOLVED/CLOSED', () => {
  const a = {
      id: 'a',
      authorId: user.id,
      authorName: 'Pessoa',
      content: 'Primeira',
      createdAt: '2026-10-30T10:00:00Z',
      attachments: [],
    },
    b = { ...a, id: 'b', createdAt: '2026-10-30T11:00:00Z' };
  assert.deepEqual(
    mergeMessages([b, a, b]).map((x) => x.id),
    ['a', 'b'],
  );
  assert.equal(chatWritable('RESOLVED'), false);
  assert.equal(chatWritable('CLOSED'), false);
  assert.equal(chatWritable('OPEN'), true);
  assert.equal(chatWritable('IN_PROGRESS'), true);
  assert.equal(chatWritable('PENDING'), true);
});
test('administração centraliza perfis e senha fica no próprio perfil, inclusive ADMIN somente leitura', () => {
  const html = renderToStaticMarkup(
    React.createElement(Administration, {
      user,
      path: '#/admin/usuarios',
      onExpired: () => {},
    }),
  );
  assert.doesNotMatch(html, /href="#\/admin\/usuarios\/tecnicos"/);
  assert.match(html, /Todos os perfis/);
  assert.equal(
    authDestination(user, '#/admin/usuarios/tecnicos'),
    '#/admin/usuarios',
  );
  const profile = renderToStaticMarkup(
    React.createElement(Profile, {
      initialUser: user,
      onUpdated: () => {},
      onExpired: () => {},
    }),
  );
  assert.match(profile, /Alterar senha/);
  assert.doesNotMatch(profile, /<form/);
});
test('referência de sincronização conserva exatamente as seis categorias e dezesseis serviços originais sem formulários demonstrativos', () => {
  const ref = JSON.parse(
      readFileSync(
        new URL(
          '../../backend/src/modules/catalog/reference-catalog.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ),
    c = initialCatalog();
  assert.deepEqual(
    ref.categories,
    c.categories.map(({ id, name, description, active, order }) => ({
      key: id,
      name,
      description,
      isActive: active,
      displayOrder: order,
    })),
  );
  assert.deepEqual(
    ref.services,
    c.services.map(({ id, categoryId, name, description, active, order }) => ({
      key: id,
      categoryKey: categoryId,
      name,
      description,
      isActive: active,
      displayOrder: order,
    })),
  );
});
