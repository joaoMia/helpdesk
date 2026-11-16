import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
Object.assign(globalThis, { React });
import { renderToStaticMarkup } from 'react-dom/server';
import { createAuthClient } from '../src/lib/auth-client';
import { TicketConversation } from '../src/components/ticket-conversation';
const id = '90000000-0000-4000-8000-000000000001';
test('adapter de conversa de Projetos usa rotas próprias e preserva as rotas de anexos de formulário', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const conversation = {
    comments: [],
    total: 0,
    page: 1,
    pageSize: 50,
    attachments: [],
    solution: null,
  };
  const client = createAuthClient(async (url, options) => {
    const value = String(url);
    calls.push({ url: value, options });
    if (value.endsWith('/csrf'))
      return Response.json({ csrfToken: 'csrf-sintetico' });
    if (value.includes('/conversation?')) return Response.json(conversation);
    if (value.endsWith('/conversation/messages')) return Response.json({ id });
    if (
      value.includes('/conversation/attachments') &&
      options?.method === 'POST'
    )
      return Response.json({
        attachment: {
          id,
          uploaderId: id,
          name: 'anexo.txt',
          mime: 'text/plain',
          size: 5,
          createdAt: '2026-11-08T12:00:00.000Z',
          uploaderName: 'Pessoa',
          previewable: false,
        },
      });
    if (options?.method === 'DELETE')
      return new Response(null, { status: 204 });
    return new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'Content-Type': 'application/octet-stream' },
    });
  });
  assert.deepEqual(
    await client.conversation(id, 1, 'project-conversation'),
    conversation,
  );
  assert.ok(
    client
      .conversationStreamUrl(id, 'project-conversation')
      .includes('/projects/' + id + '/conversation/stream'),
  );
  await client.addComment(id, 'Mensagem', [], id, 'project-conversation');
  const file = await client.uploadAttachment(
    id,
    new File(['texto'], 'anexo.txt', { type: 'text/plain' }),
    true,
    'project-conversation',
  );
  assert.equal(file.name, 'anexo.txt');
  await client.discardAttachment(id, file.id, 'project-conversation');
  const download = await client.downloadAttachment(
    id,
    id,
    'project-conversation',
  );
  assert.equal(download.size, 3);
  await client.downloadAttachment(id, id, 'projects');
  const message = calls.find((c) => c.url.endsWith('/conversation/messages'))!;
  assert.equal(message.options?.credentials, 'include');
  assert.equal(
    (message.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'csrf-sintetico',
  );
  assert.equal(
    calls.filter((c) =>
      c.url.includes('/projects/' + id + '/conversation/attachments'),
    ).length,
    3,
  );
  assert.ok(
    calls.some(
      (c) =>
        c.url.includes('/projects/' + id + '/attachments/' + id) &&
        !c.url.includes('/conversation/'),
    ),
    'download dos anexos da abertura mantém o endpoint original',
  );
});
test('conversa reutiliza componente visual e controles de chat sem exibir solução para Projetos', () => {
  const user = {
    id,
    name: 'Pessoa fictícia',
    email: 'pessoa@example.invalid',
    role: 'REQUESTER' as const,
    mustChangePassword: false,
  };
  const html = renderToStaticMarkup(
    React.createElement(TicketConversation, {
      id,
      status: 'IN_PROGRESS',
      user,
      onExpired: () => {},
      onChanged: () => {},
      resource: 'project-conversation',
      contextLabel: 'projeto',
      allowWrite: true,
      allowSolve: false,
    }),
  );
  assert.match(html, /Conversa do projeto/);
  assert.match(html, /Mensagens do projeto/);
  assert.match(html, /Enviar mensagem/);
  assert.doesNotMatch(html, /Adicionar solução/);
});
test('solicitante autor vê composer em estados não terminais e terminais permanecem somente leitura', () => {
  const user = {
    id,
    name: 'Solicitante fictício',
    email: 'solicitante@example.invalid',
    role: 'REQUESTER' as const,
    mustChangePassword: false,
  };
  for (const status of ['REQUESTED', 'PLANNING', 'IN_PROGRESS']) {
    const html = renderToStaticMarkup(
      React.createElement(TicketConversation, {
        id,
        status,
        user,
        onExpired: () => {},
        onChanged: () => {},
        resource: 'project-conversation',
        contextLabel: 'projeto',
        allowWrite: true,
        allowSolve: false,
      }),
    );
    assert.match(html, /Enviar mensagem/, status);
    assert.match(html, /Mensagem/);
  }
  for (const status of ['COMPLETED', 'CANCELED']) {
    const html = renderToStaticMarkup(
      React.createElement(TicketConversation, {
        id,
        status,
        user,
        onExpired: () => {},
        onChanged: () => {},
        resource: 'project-conversation',
        contextLabel: 'projeto',
        allowWrite: false,
        allowSolve: false,
      }),
    );
    assert.doesNotMatch(html, /Enviar mensagem/, status);
    assert.match(html, /somente leitura/i);
  }
});
