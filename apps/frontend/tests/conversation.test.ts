import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
Object.assign(globalThis, { React });
import { renderToStaticMarkup } from 'react-dom/server';
import {
  commentInputSchema,
  solutionInputSchema,
  ticketStatusSchema,
} from '@helpdesk/contracts';
import { createAuthClient } from '../src/lib/auth-client';
import { TicketConversation } from '../src/components/ticket-conversation';
import { mergeMessages } from '../src/lib/chat-messages';
const id = '90000000-0000-4000-8000-000000000001';
test('cliente lê a evidência da abertura como mensagem e conserva um único arquivo após nova leitura', async () => {
  const stamp = '2026-11-10T12:00:00.000Z';
  const attachment = {
    id: '90000000-0000-4000-8000-000000000002',
    uploaderId: id,
    uploaderName: 'Solicitante fictício',
    name: 'evidencia.png',
    mime: 'image/png',
    size: 68,
    createdAt: stamp,
    previewable: true,
  };
  const message = {
    id: '90000000-0000-4000-8000-000000000003',
    authorId: id,
    authorName: attachment.uploaderName,
    content: 'Anexos enviados na abertura do chamado.',
    createdAt: stamp,
    attachments: [attachment],
  };
  const client = createAuthClient(async () =>
    Response.json({
      comments: [message],
      total: 1,
      page: 1,
      pageSize: 10,
      attachments: [],
      solution: null,
    }),
  );
  const first = await client.conversation(id);
  const reloaded = await client.conversation(id);
  assert.deepEqual(mergeMessages([...first.comments, ...reloaded.comments]), [
    message,
  ]);
  assert.deepEqual(reloaded.attachments, []);
});
test('conversa: contratos estritos preservam autoria backend e distinguem solução de fechamento', () => {
  assert.equal(
    commentInputSchema.safeParse({ content: 'Resposta', authorId: id }).success,
    false,
  );
  assert.equal(commentInputSchema.safeParse({ content: '  ' }).success, false);
  assert.equal(
    solutionInputSchema.safeParse({ description: 'Solução', status: 'CLOSED' })
      .success,
    false,
  );
  assert.equal(
    solutionInputSchema.safeParse({
      description: 'Feito',
      attachmentIds: [id, id],
    }).success,
    false,
  );
  assert.equal(ticketStatusSchema.parse('RESOLVED'), 'RESOLVED');
  assert.equal(ticketStatusSchema.parse('CLOSED'), 'CLOSED');
});
test('conversa: cliente transmite cookies e CSRF, sem repetir falha de transporte', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const client = createAuthClient(async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-csrf' });
    return Response.json({ id });
  });
  await client.addComment(id, 'Texto');
  const op = calls.find((c) => c.url.endsWith('/comments'))!;
  assert.equal(op.options?.credentials, 'include');
  assert.equal(
    (op.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'test-csrf',
  );
  assert.deepEqual(JSON.parse(op.options?.body as string), {
    content: 'Texto',
    attachmentIds: [],
  });
  let writes = 0;
  const broken = createAuthClient(async (url) => {
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-csrf' });
    writes++;
    throw new TypeError('network');
  });
  await assert.rejects(broken.solveTicket(id, 'Feito'));
  assert.equal(writes, 1);
});
test('conversa: layout reutiliza painel/timeline, campos rotulados e encerrado somente leitura', () => {
  const user = {
    id,
    name: 'Pessoa isolada',
    email: 'isolado@example.invalid',
    role: 'REQUESTER' as const,
    mustChangePassword: false,
  };
  for (const role of ['REQUESTER', 'TECHNICIAN', 'ADMIN'] as const) {
    const html = renderToStaticMarkup(
      React.createElement(TicketConversation, {
        id,
        status: 'OPEN',
        user: { ...user, role },
        onExpired: () => {},
        onChanged: () => {},
      }),
    );
    assert.match(html, /Conversa/);
    assert.doesNotMatch(
      html,
      /timeline|Relacionar .*próximo|somente para consulta/,
    );
    assert.match(html, /Enviar mensagem/);
    assert.match(html, /type="file"/);
    assert.match(html, /role="status"/);
  }
  const closed = renderToStaticMarkup(
    React.createElement(TicketConversation, {
      id,
      status: 'CLOSED',
      user,
      onExpired: () => {},
      onChanged: () => {},
    }),
  );
  assert.doesNotMatch(closed, /Enviar mensagem|type="file"/);
  assert.match(closed, /somente leitura/);
});
