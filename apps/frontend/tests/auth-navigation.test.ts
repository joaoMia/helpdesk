import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicUser } from '@helpdesk/contracts';
import {
  authDestination,
  authenticatedHome,
} from '../src/navigation/auth-routes.js';

const requester: PublicUser = {
  id: '99b7a7b9-237e-4e9b-913e-12ed347f55af',
  name: 'Solicitante de teste',
  email: 'solicitante@example.invalid',
  role: 'REQUESTER',
  mustChangePassword: false,
};

test('login e restauração usam o perfil da API e corrigem URLs de outro perfil', () => {
  for (const path of [
    '#/login',
    '#/register',
    '#/account',
    '#/admin/painel',
    '#/technician/painel',
  ])
    assert.equal(authDestination(requester, path), '#/requester/painel');
  assert.equal(
    authenticatedHome({ ...requester, role: 'ADMIN' }),
    '#/admin/painel',
  );
  assert.equal(
    authenticatedHome({ ...requester, role: 'TECHNICIAN' }),
    '#/technician/painel',
  );
});

test('sem sessão ou após logout nenhuma URL protegida abre a área comum', () => {
  for (const path of [
    '#/requester/painel',
    '#/account',
    '#/change-password',
    '#/admin/usuarios',
    '#/technician/painel',
  ])
    assert.equal(authDestination(null, path), '#/login');
  assert.equal(authDestination(null, '#/register'), '#/register');
});

test('troca obrigatória precede a área comum e resolução não entra em loop', () => {
  const technician = {
    ...requester,
    role: 'TECHNICIAN',
    mustChangePassword: true,
  } as const;
  for (const user of [null, requester, technician])
    for (const path of [
      '#/login',
      '#/register',
      '#/account',
      '#/admin/painel',
      '#/change-password',
    ]) {
      const destination = authDestination(user, path);
      assert.equal(authDestination(user, destination), destination);
      if (user?.mustChangePassword)
        assert.equal(destination, '#/change-password');
    }
});

test('laboratório permanece em namespace próprio e não escolhe perfil autenticado', () => {
  assert.equal(
    authDestination(requester, '#/demo/admin/painel'),
    '#/demo/admin/painel',
  );
  assert.equal(
    authDestination(requester, '#/admin/painel'),
    '#/requester/painel',
  );
  assert.equal(
    authDestination(null, '#/demo/requester/painel'),
    '#/demo/requester/painel',
  );
});
