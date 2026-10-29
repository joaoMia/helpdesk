import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient, AuthError } from '../src/lib/auth-client';
import { authDestination } from '../src/navigation/auth-routes';
import { updateProfileSchema } from '@helpdesk/contracts';
const user = {
  id: '90000000-0000-4000-8000-000000000001',
  name: 'Pessoa teste',
  email: 'pessoa@example.invalid',
  role: 'REQUESTER' as const,
  mustChangePassword: false,
};
test('perfil: rota própria mantém identidade e bloqueia área solicitante para outros perfis', () => {
  assert.equal(
    authDestination(user, '#/requester/perfil'),
    '#/requester/perfil',
  );
  assert.equal(
    authDestination({ ...user, role: 'TECHNICIAN' }, '#/requester/perfil'),
    '#/technician/painel',
  );
  assert.equal(authDestination(null, '#/requester/perfil'), '#/login');
  assert.equal(
    authDestination(
      { ...user, mustChangePassword: true },
      '#/requester/perfil',
    ),
    '#/change-password',
  );
});
test('perfil: contrato normaliza e-mail e rejeita atributos privilegiados/vazio', () => {
  assert.equal(
    updateProfileSchema.parse({ email: ' TESTE@EXAMPLE.INVALID ' }).email,
    'teste@example.invalid',
  );
  for (const input of [
    {},
    { name: ' ' },
    { name: 'Pessoa', role: 'ADMIN' },
    { email: 'inválido' },
    { userId: user.id },
  ])
    assert.equal(updateProfileSchema.safeParse(input).success, false);
});
test('perfil: API usa users/me, cookies e CSRF de auth, sem retornar tokens', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const api = createAuthClient(async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(
      String(url).endsWith('/csrf')
        ? { csrfToken: 'test-only-csrf' }
        : options?.method === 'PATCH'
          ? { user, reauthenticate: true }
          : { user },
    );
  });
  assert.deepEqual(await api.profile(), user);
  assert.equal(
    (await api.updateProfile({ name: 'Pessoa teste' })).reauthenticate,
    true,
  );
  assert.deepEqual(
    calls.map((c) => c.url),
    ['/api/users/me', '/api/auth/csrf', '/api/users/me'],
  );
  assert.equal(calls[2]!.options?.credentials, 'include');
  assert.equal(
    (calls[2]!.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'test-only-csrf',
  );
});
test('perfil: falha de senha não renova/reenvia mutação nem sinaliza sucesso', async () => {
  let writes = 0;
  const api = createAuthClient(async (url) => {
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-only' });
    writes++;
    return Response.json(
      {
        error: {
          code: 'CURRENT_PASSWORD_INVALID',
          message: 'Confirme a senha atual.',
        },
      },
      { status: 403 },
    );
  });
  await assert.rejects(
    api.updateProfile({
      email: 'other@example.invalid',
      currentPassword: 'synthetic-invalid',
    }),
    (e) => e instanceof AuthError && e.status === 403,
  );
  assert.equal(writes, 1);
});
