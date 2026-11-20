import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
Object.assign(globalThis, { React });
import { renderToStaticMarkup } from 'react-dom/server';
import {
  commentInputSchema,
  projectMessageInputSchema,
  solutionInputSchema,
  ticketStatusSchema,
  type TicketDetail,
} from '@helpdesk/contracts';
import { AuthError, createAuthClient } from '../src/lib/auth-client';
import { TicketConversation } from '../src/components/ticket-conversation';
import { TicketOpening } from '../src/components/ticket-opening';
import * as chatMessages from '../src/lib/chat-messages';
const id = '90000000-0000-4000-8000-000000000001';
const { mergeMessages } = chatMessages;
test('cliente conserva o erro de schema e oculta respostas de infraestrutura', async () => {
  let failure = Response.json(
    {
      error: {
        code: 'ATTACHMENT_SCHEMA_OUTDATED',
        message: 'Atualize o banco.',
      },
    },
    { status: 503 },
  );
  const client = createAuthClient(async (url) =>
    String(url).endsWith('/csrf')
      ? Response.json({ csrfToken: 'csrf' })
      : failure,
  );
  const send = () => client.addComment(id, '', [id], id);
  await assert.rejects(
    send,
    (error) =>
      error instanceof AuthError && error.code === 'ATTACHMENT_SCHEMA_OUTDATED',
  );
  failure = new Response('<html>Proxy indisponível</html>', { status: 503 });
  await assert.rejects(
    send,
    (error) => error instanceof AuthError && error.code === 'API_UNAVAILABLE',
  );
});
test('os dois chats aceitam anexos sem texto e rejeitam mensagens vazias', () => {
  for (const schema of [commentInputSchema, projectMessageInputSchema]) {
    const payload = { clientMessageId: id };
    assert.equal(
      schema.safeParse({ ...payload, content: ' \n ' }).success,
      false,
    );
    assert.equal(schema.parse({ ...payload, attachmentIds: [id] }).content, '');
    assert.equal(
      schema.parse({ ...payload, content: ' \n ', attachmentIds: [id] })
        .content,
      '',
    );
    assert.equal(
      schema.parse({ ...payload, content: ' Texto ' }).content,
      'Texto',
    );
    assert.equal(
      schema.parse({ ...payload, content: 'Texto', attachmentIds: [id] })
        .content,
      'Texto',
    );
    assert.equal(
      schema.safeParse({ ...payload, attachmentIds: [id, id] }).success,
      false,
    );
  }
});
test('solicitação registrada separa identificação, descrição e campos históricos com rótulos', () => {
  const stamp = '2026-11-10T12:00:00.000Z';
  const ticket: TicketDetail = {
    id,
    code: 42,
    subject: 'Instalação de aplicativo',
    description: 'Necessário para a sala de treinamento.',
    status: 'OPEN',
    priority: null,
    assignedTechnicianId: null,
    serviceId: id,
    serviceName: 'Instalação',
    categoryName: 'Aplicativos',
    createdAt: stamp,
    updatedAt: stamp,
    requesterId: id,
    formVersionId: id,
    firstStartedAt: null,
    closedAt: null,
    serviceSnapshot: {
      schemaVersion: 1,
      serviceId: id,
      serviceName: 'Instalação',
      serviceDescription: '',
      categoryId: id,
      categoryName: 'Aplicativos',
      formVersionId: id,
      formVersion: 3,
      fields: [
        {
          id,
          key: 'app',
          label: 'Nome do aplicativo',
          type: 'TEXT',
          required: true,
        },
      ],
    },
    answers: [{ fieldKey: 'app', value: 'Editor de texto', createdAt: stamp }],
  };
  const html = renderToStaticMarkup(
    React.createElement(TicketOpening, {
      ticket,
      requester: 'Pessoa fictícia',
      files: React.createElement('span', null, 'evidencia.png'),
    }),
  );
  assert.match(html, /<dt>Solicitante<\/dt><dd>Pessoa fictícia<\/dd>/);
  assert.match(
    html,
    /<dt>Data da solicitação<\/dt><dd><time dateTime="2026-11-10T12:00:00.000Z"/,
  );
  assert.match(
    html,
    /<h4>Assunto<\/h4>.*Instalação de aplicativo.*<h4>Descrição<\/h4>.*Necessário para a sala de treinamento/,
  );
  assert.match(html, /<h4>Serviço solicitado<\/h4>.*Aplicativos.*Instalação/);
  assert.doesNotMatch(html, /<h4>Formulário<\/h4>|Versão 3/);
  assert.match(
    html,
    /<dt>Nome do aplicativo<\/dt><dd[^>]*>Editor de texto<\/dd>/,
  );
  assert.match(html, /<h4>Anexos da abertura<\/h4>.*evidencia\.png/);
});
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
  const opening = {
    requesterId: id,
    createdAt: stamp,
    serviceSnapshot: { fields: [{ key: 'evidencia', type: 'FILE' }] },
    answers: [{ fieldKey: 'evidencia', value: [attachment.id] }],
  } as Parameters<typeof chatMessages.projectTicketOpening>[0];
  const realMessage = {
    ...message,
    id: '90000000-0000-4000-8000-000000000004',
    createdAt: '2026-11-10T12:01:00.000Z',
    attachments: [],
  };
  const projected = chatMessages.projectTicketOpening(opening, {
    ...reloaded,
    comments: [message, realMessage],
    attachments: [attachment],
    total: 2,
  });
  assert.deepEqual(projected.openingAttachments, [attachment]);
  assert.deepEqual(projected.comments, [realMessage]);
  assert.deepEqual(projected.previousAttachments, []);

  const legacy = chatMessages.projectTicketOpening(opening, {
    ...reloaded,
    comments: [realMessage],
    attachments: [attachment],
    total: 1,
  });
  assert.deepEqual(legacy.openingAttachments, [attachment]);
  assert.deepEqual(legacy.comments, [realMessage]);
  assert.deepEqual(legacy.previousAttachments, []);
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
