import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authDestination,
  authenticatedHome,
} from '../src/navigation/auth-routes';
import { makeServiceFormTemplate } from '../src/lib/service-form-templates';
import { visibleFormKeys } from '@helpdesk/contracts';

test('acessos antigos ao módulo retirado redirecionam ao início, preservando o perfil real', () => {
  for (const role of ['REQUESTER', 'TECHNICIAN', 'ADMIN'] as const) {
    const user = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Teste',
      email: 'teste@example.invalid',
      role,
      mustChangePassword: false,
    };
    for (const path of [
      '#/requester/ocorrencias',
      '#/technician/ocorrencias',
      '#/admin/ocorrencias',
      '#/requester/validacoes',
    ])
      assert.equal(authDestination(user, path), authenticatedHome(user));
  }
});
test('modelo real de criação de usuário permite somente um sistema e preserva condições', () => {
  const form = makeServiceFormTemplate('s1');
  assert.equal(form.fields.find((f) => f.key === 'systems')?.type, 'SELECT');
  const visible = visibleFormKeys(form.fields, { systems: 'TOTVS' });
  assert.equal(visible.has('modules'), true);
  assert.equal(visible.has('re'), false);
  const installation = makeServiceFormTemplate('s2');
  assert.ok(
    installation.fields.some((f) => f.label === 'Motivo da instalação'),
  );
  assert.ok(installation.fields.some((f) => f.label === 'URL para instalação'));
});
