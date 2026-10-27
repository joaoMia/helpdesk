import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient, AuthError } from '../src/lib/auth-client.js';
const user = {
  id: '99b7a7b9-237e-4e9b-913e-12ed347f55af',
  name: 'Pessoa de teste',
  email: 'pessoa@example.invalid',
  role: 'REQUESTER',
  mustChangePassword: false,
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
test('cliente usa cookies, cabeçalho CSRF e resposta pública, sem receber tokens de sessão', async () => {
  const requests: { url: string; options: RequestInit | undefined }[] = [];
  const client = createAuthClient(async (input, options) => {
    const url = String(input);
    requests.push({ url, options });
    return url.endsWith('/csrf')
      ? json({ csrfToken: 'token-csrf-ficticio' })
      : json({ user });
  });
  const result = await client.login({
    email: user.email,
    password: 'valor-ficticio-nao-persistido',
  });
  assert.equal(result.role, 'REQUESTER');
  assert.equal(requests.length, 2);
  assert.ok(requests.every((r) => r.options?.credentials === 'include'));
  const headers = requests[1]!.options!.headers as Record<string, string>;
  assert.equal(headers['X-CSRF-Token'], 'token-csrf-ficticio');
  assert.equal('Authorization' in headers, false);
  assert.deepEqual(Object.keys(result).sort(), Object.keys(user).sort());
});
test('renovação single-flight evita duas rotações concorrentes na mesma aba', async () => {
  let valid = false,
    rotations = 0;
  const client = createAuthClient(async (input) => {
    const url = String(input);
    if (url.endsWith('/csrf')) return json({ csrfToken: 'csrf' });
    if (url.endsWith('/refresh')) {
      rotations++;
      await new Promise((resolve) => setTimeout(resolve, 5));
      valid = true;
      return json({ user });
    }
    return valid
      ? json({ user })
      : json(
          { error: { code: 'SESSION_INVALID', message: 'Entre novamente.' } },
          401,
        );
  });
  const results = await Promise.all([client.me(), client.me()]);
  assert.equal(rotations, 1);
  assert.equal(results[0]!.id, user.id);
});
test('expiração e erro de credenciais são propagados sem falso sucesso', async () => {
  const client = createAuthClient(async (input) =>
    String(input).endsWith('/csrf')
      ? json({ csrfToken: 'csrf' })
      : json(
          {
            error: {
              code: 'INVALID_CREDENTIALS',
              message: 'Credenciais inválidas ou conta indisponível.',
            },
          },
          401,
        ),
  );
  await assert.rejects(
    () => client.login({ email: user.email, password: 'ficticia' }),
    (e) =>
      e instanceof AuthError &&
      e.status === 401 &&
      e.code === 'INVALID_CREDENTIALS',
  );
});

test('cadastro indisponível orienta login sem confirmar existência do e-mail', async () => {
  const message =
    'Não foi possível concluir o cadastro. Se você já possui uma conta, tente entrar ou entre em contato com o suporte.';
  const client = createAuthClient(async (input) =>
    String(input).endsWith('/csrf')
      ? json({ csrfToken: 'csrf' })
      : json({ error: { code: 'REGISTRATION_UNAVAILABLE', message } }, 409),
  );
  await assert.rejects(
    () =>
      client.register({
        name: user.name,
        email: user.email,
        password: 'valor-ficticio',
      }),
    (error) =>
      error instanceof AuthError &&
      error.message === message &&
      !error.message.includes(user.email),
  );
});

test('falhas de rede e proxy não exibem detalhes internos ao usuário', async () => {
  const offline = createAuthClient(async () => {
    throw new Error('detalhe-interno-nao-exibir');
  });
  const proxy = createAuthClient(
    async () =>
      new Response('Prisma: detalhe-interno-nao-exibir', { status: 502 }),
  );
  for (const client of [offline, proxy])
    await assert.rejects(
      () =>
        client.register({
          name: user.name,
          email: user.email,
          password: 'valor-ficticio',
        }),
      (error) =>
        error instanceof AuthError &&
        error.code === 'API_UNAVAILABLE' &&
        !error.message.includes('detalhe-interno'),
    );
});

test('refresh revogado retorna ao fluxo de sessão inválida sem repetir renovação', async () => {
  let attempts = 0;
  const client = createAuthClient(async (input) => {
    if (String(input).endsWith('/csrf')) return json({ csrfToken: 'csrf' });
    if (String(input).endsWith('/refresh')) attempts++;
    return json(
      { error: { code: 'SESSION_INVALID', message: 'Entre novamente.' } },
      401,
    );
  });
  await assert.rejects(
    () => client.me(),
    (error) => error instanceof AuthError && error.code === 'SESSION_INVALID',
  );
  assert.equal(attempts, 1);
});
