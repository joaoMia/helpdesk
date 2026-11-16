import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { randomBytes } from 'node:crypto';
import {
  adminUserInputSchema,
  adminUserUpdateSchema,
  adminUserListSchema,
  companyUpdateSchema,
  departmentUpdateSchema,
  scheduleInputSchema,
  scheduleUpdateSchema,
} from '@helpdesk/contracts';
import { createAuthClient, AuthError } from '../src/lib/auth-client';
import { authDestination } from '../src/navigation/auth-routes';
import { minute, time } from '../src/lib/work-schedule-presentation';
import { AdminUserActions } from '../src/pages/admin-users';
Object.assign(globalThis, { React });
const id = '90000000-0000-4000-8000-000000000001',
  stamp = '2026-10-30T00:00:00.000Z';
const user = {
  id,
  name: 'Pessoa isolada',
  email: 'test@example.invalid',
  role: 'REQUESTER' as const,
  username: null,
  companyId: null,
  departmentId: null,
  workScheduleId: null,
  companyName: null,
  departmentName: null,
  workScheduleName: null,
  isActive: true,
  mustChangePassword: true,
  createdAt: stamp,
  updatedAt: stamp,
};
test('ações de usuário exibem edição, ativação e senha sem exclusão', () => {
  for (const isActive of [true, false]) {
    const html = renderToStaticMarkup(
      React.createElement(AdminUserActions, {
        isActive,
        onEdit: () => {},
        onToggle: () => {},
        onResetPassword: () => {},
      }),
    );
    assert.match(html, /Visualizar \/ editar/);
    assert.match(html, isActive ? />Desativar</ : />Ativar</);
    assert.match(html, /Redefinir senha/);
    assert.doesNotMatch(html, /Excluir usuário/);
  }
  const own = renderToStaticMarkup(
    React.createElement(AdminUserActions, {
      isActive: true,
      onEdit: () => {},
      onToggle: () => {},
    }),
  );
  assert.doesNotMatch(own, /Redefinir senha/);
});
test('administração: somente ADMIN acessa as rotas reais e troca inicial continua obrigatória', () => {
  for (const role of ['ADMIN', 'TECHNICIAN', 'REQUESTER'] as const)
    for (const path of [
      '#/admin/usuarios',
      '#/admin/usuarios/tecnicos',
      '#/admin/usuarios/empresas',
      '#/admin/usuarios/setores',
      '#/admin/usuarios/expedientes',
    ]) {
      const actor = {
        id,
        name: user.name,
        email: user.email,
        role,
        mustChangePassword: false,
      };
      assert.equal(
        authDestination(actor, path),
        role === 'ADMIN'
          ? path === '#/admin/usuarios/tecnicos'
            ? '#/admin/usuarios'
            : path
          : role === 'TECHNICIAN'
            ? '#/technician/painel'
            : '#/requester/painel',
      );
      assert.equal(
        authDestination({ ...actor, mustChangePassword: true }, path),
        '#/change-password',
      );
    }
});
test('administração: contratos recusam hash/flags sensíveis e listas com credenciais', () => {
  for (const field of [
    'passwordHash',
    'password',
    'mustChangePassword',
    'userId',
    'permissions',
  ]) {
    assert.equal(
      adminUserInputSchema.safeParse({
        name: user.name,
        email: user.email,
        role: 'ADMIN',
        [field]: 'forged',
      }).success,
      false,
    );
    assert.equal(
      adminUserUpdateSchema.safeParse({ [field]: 'forged' }).success,
      false,
    );
  }
  assert.equal(
    adminUserListSchema.safeParse({
      items: [{ ...user, passwordHash: 'not-public' }],
      total: 1,
      page: 1,
      pageSize: 10,
    }).success,
    false,
  );
});
test('administração: patch de nome não reativa cadastros nem limpa horários/exceções', () => {
  assert.deepEqual(companyUpdateSchema.parse({ name: 'Nome alterado' }), {
    name: 'Nome alterado',
  });
  assert.deepEqual(departmentUpdateSchema.parse({ name: 'Nome alterado' }), {
    name: 'Nome alterado',
  });
  assert.deepEqual(scheduleUpdateSchema.parse({ name: 'Nome alterado' }), {
    name: 'Nome alterado',
  });
});
test('jornadas: intervalos adjacentes são válidos; sobrepostos e fuso inválido são recusados', () => {
  const input = {
    name: 'Expediente',
    timezone: 'America/Sao_Paulo',
    weekly: [
      { day: 1, startMinute: 480, endMinute: 720 },
      { day: 1, startMinute: 720, endMinute: 960 },
    ],
  };
  assert.equal(scheduleInputSchema.safeParse(input).success, true);
  assert.equal(
    scheduleInputSchema.safeParse({
      ...input,
      weekly: [...input.weekly, { day: 1, startMinute: 600, endMinute: 800 }],
    }).success,
    false,
  );
  assert.equal(
    scheduleInputSchema.safeParse({ ...input, timezone: 'Invalid/Timezone' })
      .success,
    false,
  );
  assert.equal(
    scheduleInputSchema.safeParse({
      ...input,
      exceptions: [{ date: '2026-02-30', intervals: [] }],
    }).success,
    false,
  );
});
test('jornadas: limpar horário não se converte silenciosamente em meia-noite', () => {
  assert.equal(Number.isNaN(minute('')), true);
  assert.equal(time(Number.NaN), '');
  assert.equal(minute('00:00', true), 1440);
  assert.equal(minute('00:00'), 0);
});
test('administração: criação mantém cookies/CSRF, senha só aparece na resposta de criação', async () => {
  const secret = randomBytes(24).toString('base64url'),
    calls: { url: string; options?: RequestInit }[] = [];
  const client = createAuthClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'csrf-test' });
    return Response.json({ user, temporaryPassword: secret }, { status: 201 });
  });
  const result = await client.createAdminUser({
    name: user.name,
    email: user.email,
    role: 'REQUESTER',
  });
  assert.equal(result.user.id, id);
  assert.equal(result.temporaryPassword.length >= 12, true);
  const post = calls.find((c) => c.options?.method === 'POST')!;
  assert.equal(post.url, '/api/admin/users');
  assert.equal(post.options?.credentials, 'include');
  assert.equal(
    new Headers(post.options?.headers).get('X-CSRF-Token'),
    'csrf-test',
  );
});
test('administração: erro de transporte não repete criação/redefinição nem anuncia sucesso', async () => {
  let posts = 0;
  const client = createAuthClient(async (url, options) => {
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'csrf-test' });
    if (options?.method === 'POST') posts++;
    throw new Error('transport');
  });
  await assert.rejects(
    () =>
      client.createAdminUser({
        name: user.name,
        email: user.email,
        role: 'ADMIN',
      }),
    (e) => e instanceof AuthError && e.status === 0,
  );
  assert.equal(posts, 1);
  await assert.rejects(
    () => client.resetAdminPassword(id),
    (e) => e instanceof AuthError && e.status === 0,
  );
  assert.equal(posts, 2);
});
