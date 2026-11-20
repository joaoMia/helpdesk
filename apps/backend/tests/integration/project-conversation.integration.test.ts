import { expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { d, account, mutate, origin } from './lifecycle-fixture.js';
type Client = Awaited<ReturnType<typeof account>>['c'];
async function createProject(c: Client, title = 'Projeto de conversa') {
  const result = await mutate(c, '/projects', {
    title,
    objective: 'Validar conversa persistida entre participantes.',
    need: 'Confirmar autorização, anexos e sincronização em tempo real.',
    clientOperationId: randomUUID(),
  });
  expect(result.status).toBe(201);
  return result.body.project.id as string;
}
async function assign(admin: Client, id: string, technicianId: string) {
  const state = await admin.agent.get('/projects/' + id + '/workflow');
  const result = await mutate(admin, '/projects/' + id + '/assignment', {
    expectedRevision: state.body.revision,
    clientOperationId: randomUUID(),
    technicianId,
    reason: 'Atribuição para teste isolado.',
  });
  expect(result.status).toBe(200);
}
async function send(
  c: Client,
  id: string,
  content: string,
  clientMessageId = randomUUID(),
  attachmentIds: string[] = [],
) {
  return mutate(c, '/projects/' + id + '/conversation/messages', {
    clientMessageId,
    content,
    attachmentIds,
  });
}
async function connect(c: Client, id: string) {
  const server = c.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const cookie = c.agent.jar
    .getCookies({
      domain: '127.0.0.1',
      path: '/',
      secure: false,
      script: false,
    })
    .toValueString();
  const controller = new AbortController();
  const response = await fetch(
    `http://127.0.0.1:${address.port}/projects/${id}/conversation/stream`,
    {
      headers: { Cookie: cookie, Origin: origin },
      signal: controller.signal,
    },
  );
  const reader = response.body!.getReader(),
    decoder = new TextDecoder();
  let buffered = '';
  return {
    response,
    controller,
    async frame(event: string) {
      while (true) {
        const blocks = buffered.split('\n\n'),
          index = blocks.findIndex((block) =>
            block.includes('event: ' + event),
          );
        if (index >= 0) {
          const result = blocks[index]!;
          buffered = blocks.slice(index + 1).join('\n\n');
          return result;
        }
        const next = await reader.read();
        if (next.done)
          throw Error('Stream encerrado antes do evento esperado.');
        buffered += decoder.decode(next.value);
      }
    },
    close() {
      controller.abort();
      void reader.cancel().catch(() => {});
      return new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

it('duas contas recebem mensagens em tempo real entre instâncias, com idempotência e isolamento por projeto', async () => {
  const requester = await account('REQUESTER'),
    admin = await account('ADMIN'),
    technician = await account('TECHNICIAN'),
    outsider = await account('REQUESTER'),
    first = await createProject(requester.c),
    second = await createProject(requester.c, 'Projeto independente');
  await assign(admin.c, first, technician.u.id);
  const stream = await connect(technician.c, first),
    requesterStream = await connect(requester.c, first);
  try {
    expect(stream.response.status).toBe(200);
    expect(stream.response.headers.get('content-type')).toContain(
      'text/event-stream',
    );
    await stream.frame('sync');
    await requesterStream.frame('sync');
    const clientMessageId = randomUUID(),
      sent = await send(
        requester.c,
        first,
        'Solicitante envia sem recarregar.',
        clientMessageId,
      );
    expect(sent.status).toBe(201);
    await stream.frame('sync');
    const repeated = await Promise.all([
      send(
        requester.c,
        first,
        'Solicitante envia sem recarregar.',
        clientMessageId,
      ),
      send(
        requester.c,
        first,
        'Solicitante envia sem recarregar.',
        clientMessageId,
      ),
    ]);
    expect(repeated.map((r) => r.status)).toEqual([201, 201]);
    expect(repeated[0]!.body).toEqual(sent.body);
    expect(repeated[1]!.body).toEqual(sent.body);
    expect(
      (await send(requester.c, first, 'Payload diferente.', clientMessageId))
        .status,
    ).toBe(409);
    expect(
      (await send(technician.c, first, 'Técnico responde sem F5.')).status,
    ).toBe(201);
    await requesterStream.frame('sync');
    const readRequester = await requester.c.agent.get(
      '/projects/' + first + '/conversation?page=1&pageSize=50',
    );
    expect(readRequester.status).toBe(200);
    expect(
      readRequester.body.comments.map((m: { content: string }) => m.content),
    ).toEqual([
      'Solicitante envia sem recarregar.',
      'Técnico responde sem F5.',
    ]);
    expect(
      (await outsider.c.agent.get('/projects/' + first + '/conversation'))
        .status,
    ).toBe(404);
    expect(
      (await technician.c.agent.get('/projects/' + second + '/conversation'))
        .status,
    ).toBe(404);
    expect(
      (await admin.c.agent.get('/projects/' + first + '/conversation')).status,
    ).toBe(200);
    expect(
      (await requester.c.agent.get('/projects/' + second + '/conversation'))
        .body.comments,
    ).toHaveLength(0);
    expect(
      await d.db.projectConversationMessage.count({
        where: { projectId: first },
      }),
    ).toBe(2);
  } finally {
    await stream.close();
    await requesterStream.close();
  }
});

it('troca de responsável revoga API e stream ativos do técnico anterior', async () => {
  const requester = await account('REQUESTER'),
    admin = await account('ADMIN'),
    oldTech = await account('TECHNICIAN'),
    newTech = await account('TECHNICIAN'),
    id = await createProject(requester.c);
  await assign(admin.c, id, oldTech.u.id);
  expect((await send(requester.c, id, 'Antes da troca.')).status).toBe(201);
  const stream = await connect(oldTech.c, id);
  try {
    expect(stream.response.status).toBe(200);
    await stream.frame('sync');
    await assign(admin.c, id, newTech.u.id);
    expect(await stream.frame('unavailable')).toContain('event: unavailable');
    expect(
      (await oldTech.c.agent.get('/projects/' + id + '/conversation')).status,
    ).toBe(404);
    expect((await send(oldTech.c, id, 'Após revogação.')).status).toBe(404);
    expect(
      (await newTech.c.agent.get('/projects/' + id + '/conversation')).status,
    ).toBe(200);
    expect(
      (await admin.c.agent.get('/projects/' + id + '/conversation')).status,
    ).toBe(200);
  } finally {
    await stream.close();
  }
});

it('solicitante autor conversa em REQUESTED e PLANNING; outro solicitante não acessa', async () => {
  const requester = await account('REQUESTER'),
    outsider = await account('REQUESTER'),
    admin = await account('ADMIN'),
    technician = await account('TECHNICIAN'),
    id = await createProject(requester.c);
  expect((await send(requester.c, id, 'Mensagem em REQUESTED.')).status).toBe(
    201,
  );
  await assign(admin.c, id, technician.u.id);
  const current = await admin.c.agent.get('/projects/' + id + '/workflow');
  expect(current.body.state).toBe('PLANNING');
  expect((await send(requester.c, id, 'Mensagem em PLANNING.')).status).toBe(
    201,
  );
  expect(
    (await send(technician.c, id, 'Técnico responde no planejamento.')).status,
  ).toBe(201);
  expect(
    (await outsider.c.agent.get('/projects/' + id + '/conversation')).status,
  ).toBe(404);
  expect(
    (await requester.c.agent.get('/projects/' + id + '/conversation')).body
      .comments,
  ).toHaveLength(3);
});

it('solicitante autor envia em IN_PROGRESS e a conclusão explícita torna a conversa somente leitura', async () => {
  const requester = await account('REQUESTER'),
    admin = await account('ADMIN'),
    technician = await account('TECHNICIAN'),
    id = await createProject(requester.c);
  await assign(admin.c, id, technician.u.id);
  const csrf = (
    await technician.c.agent.get('/auth/csrf').set('Origin', origin)
  ).body.csrfToken;
  let workflow = (await technician.c.agent.get('/projects/' + id + '/workflow'))
    .body;
  expect(workflow.state).toBe('PLANNING');
  expect(
    (
      await technician.c.agent
        .put('/projects/' + id + '/plan-draft')
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send({
          expectedRevision: workflow.revision,
          clientOperationId: randomUUID(),
          definition: {
            stages: [
              {
                title: 'Etapa',
                description: '',
                order: 1,
                activities: [{ title: 'Atividade', description: '', order: 1 }],
              },
            ],
          },
        })
    ).status,
  ).toBe(200);
  workflow = (await technician.c.agent.get('/projects/' + id + '/workflow'))
    .body;
  expect(
    (
      await mutate(technician.c, '/projects/' + id + '/plan-publication', {
        expectedRevision: workflow.revision,
        clientOperationId: randomUUID(),
        reason: 'Plano mínimo de teste.',
      })
    ).status,
  ).toBe(200);
  workflow = (await technician.c.agent.get('/projects/' + id + '/workflow'))
    .body;
  expect(
    (
      await mutate(technician.c, '/projects/' + id + '/start', {
        expectedRevision: workflow.revision,
        clientOperationId: randomUUID(),
      })
    ).status,
  ).toBe(200);
  expect(
    (await send(requester.c, id, 'Mensagem durante IN_PROGRESS.')).status,
  ).toBe(201);
  workflow = (await technician.c.agent.get('/projects/' + id + '/workflow'))
    .body;
  const activityId = workflow.plan.stages[0].activities[0].id;
  expect(
    (
      await technician.c.agent
        .patch('/projects/' + id + '/activities/' + activityId)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
        .send({
          expectedRevision: workflow.revision,
          clientOperationId: randomUUID(),
          state: 'DONE',
          reason: '',
        })
    ).status,
  ).toBe(200);
  workflow = (await technician.c.agent.get('/projects/' + id + '/workflow'))
    .body;
  expect(
    (
      await mutate(technician.c, '/projects/' + id + '/complete', {
        expectedRevision: workflow.revision,
        clientOperationId: randomUUID(),
        reason: 'Entrega fictícia verificada.',
      })
    ).status,
  ).toBe(200);
  expect((await send(requester.c, id, 'Mensagem após conclusão.')).status).toBe(
    409,
  );
});

it('reconexão SSE invalida o histórico e recupera mensagens perdidas sem duplicar', async () => {
  const requester = await account('REQUESTER'),
    admin = await account('ADMIN'),
    technician = await account('TECHNICIAN'),
    id = await createProject(requester.c);
  await assign(admin.c, id, technician.u.id);
  await send(requester.c, id, 'Mensagem anterior à conexão.');
  const first = await connect(technician.c, id);
  try {
    await first.frame('sync');
  } finally {
    await first.close();
  }
  await send(requester.c, id, 'Mensagem durante a desconexão.');
  const recovered = await connect(technician.c, id);
  try {
    await recovered.frame('sync');
    const history = await technician.c.agent.get(
      '/projects/' + id + '/conversation?page=1&pageSize=50',
    );
    expect(history.status).toBe(200);
    expect(
      history.body.comments.map((m: { content: string }) => m.content),
    ).toEqual([
      'Mensagem anterior à conexão.',
      'Mensagem durante a desconexão.',
    ]);
    expect(
      await d.db.projectConversationMessage.count({
        where: { projectId: id },
      }),
    ).toBe(2);
  } finally {
    await recovered.close();
  }
});

it('logout revoga a sessão e encerra o stream ativo', async () => {
  const requester = await account('REQUESTER'),
    id = await createProject(requester.c),
    stream = await connect(requester.c, id);
  try {
    expect(stream.response.status).toBe(200);
    await stream.frame('sync');
    expect((await mutate(requester.c, '/auth/logout', {})).status).toBe(204);
    expect(await stream.frame('unavailable')).toContain('event: unavailable');
  } finally {
    await stream.close();
  }
});

it('anexos da mensagem são privados, sanitizados, vinculados à conversa e baixados somente por participante atual', async () => {
  const requester = await account('REQUESTER'),
    admin = await account('ADMIN'),
    tech = await account('TECHNICIAN'),
    replaced = await account('TECHNICIAN'),
    outsider = await account('REQUESTER'),
    id = await createProject(requester.c),
    other = await createProject(requester.c, 'Outro projeto');
  await assign(admin.c, id, tech.u.id);
  const csrf = (await requester.c.agent.get('/auth/csrf').set('Origin', origin))
      .body.csrfToken,
    png = await sharp({
      create: { width: 2, height: 2, channels: 4, background: '#137c70' },
    })
      .png()
      .toBuffer(),
    uploaded = await requester.c.agent
      .post('/projects/' + id + '/conversation/attachments?name=imagem.png')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .set('Content-Type', 'application/octet-stream')
      .send(png);
  expect(uploaded.status).toBe(201);
  expect(uploaded.body.attachment).toMatchObject({
    mime: 'image/png',
    previewable: true,
  });
  const csv = await requester.c.agent
    .post('/projects/' + id + '/conversation/attachments?name=registros.csv')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from('nome,valor\nAção,3\n'));
  expect(csv.status).toBe(201);
  expect(csv.body.attachment).toMatchObject({
    mime: 'text/csv',
    previewable: false,
  });
  expect((await send(requester.c, id, '   ')).status).toBe(400);
  await expect(d.db.$executeRaw`
    INSERT INTO project_conversation_messages (project_id, author_id, client_message_id, content)
    VALUES (${id}::uuid, ${requester.u.id}::uuid, ${randomUUID()}::uuid, '')
  `).rejects.toThrow();
  const messageKey = randomUUID();
  const files = [uploaded.body.attachment.id, csv.body.attachment.id];
  expect((await send(requester.c, other, '', randomUUID(), files)).status).toBe(
    409,
  );
  const message = await send(requester.c, id, '', messageKey, files);
  expect(message.status).toBe(201);
  const replayed = await send(requester.c, id, '', messageKey, files);
  expect(replayed.status).toBe(201);
  expect(replayed.body).toEqual(message.body);
  const { comments } = (
    await tech.c.agent.get('/projects/' + id + '/conversation')
  ).body;
  expect(comments).toHaveLength(1);
  const read = comments[0];
  expect(read.content).toBe('');
  expect(read.attachments).toHaveLength(2);
  const image = read.attachments.find(
    (file: { id: string }) => file.id === uploaded.body.attachment.id,
  );
  expect(image).toMatchObject({
    name: 'imagem.png',
    mime: 'image/png',
    previewable: true,
  });
  const fileId = image.id;
  const csvDownload = await tech.c.agent.get(
    '/projects/' +
      id +
      '/conversation/attachments/' +
      csv.body.attachment.id +
      '?preview=true',
  );
  expect(csvDownload.status).toBe(200);
  expect(csvDownload.headers['content-type']).toMatch(/^text\/csv/);
  expect(csvDownload.headers['content-disposition']).toMatch(/^attachment;/);
  expect(
    (
      await tech.c.agent.get(
        '/projects/' +
          id +
          '/conversation/attachments/' +
          fileId +
          '?preview=true',
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await requester.c.agent.get(
        '/projects/' + id + '/conversation/attachments/' + fileId,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await outsider.c.agent.get(
        '/projects/' + id + '/conversation/attachments/' + fileId,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await requester.c.agent.get(
        '/projects/' + other + '/conversation/attachments/' + fileId,
      )
    ).status,
  ).toBe(404);
  await assign(admin.c, id, replaced.u.id);
  expect(
    (
      await tech.c.agent.get(
        '/projects/' + id + '/conversation/attachments/' + fileId,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await replaced.c.agent.get(
        '/projects/' + id + '/conversation/attachments/' + fileId,
      )
    ).status,
  ).toBe(200);
});

it('schema anterior identifica a incompatibilidade ao enviar imagem sem texto em Projetos', async () => {
  const owner = await account('REQUESTER');
  const id = await createProject(owner.c);
  await d.db.$executeRaw`
    ALTER TABLE project_conversation_messages DROP CONSTRAINT project_conversation_messages_content_check,
    ADD CONSTRAINT project_conversation_messages_content_check CHECK (length(btrim(content)) BETWEEN 1 AND 4000)
  `;
  const token = (await owner.c.agent.get('/auth/csrf').set('Origin', origin))
    .body.csrfToken;
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#123456' },
  })
    .png()
    .toBuffer();
  const upload = await owner.c.agent
    .post('/projects/' + id + '/conversation/attachments?name=isolado.png')
    .set('Origin', origin)
    .set('X-CSRF-Token', token)
    .set('Content-Type', 'application/octet-stream')
    .send(png);
  expect(upload.status).toBe(201);
  const fileId = upload.body.attachment.id;
  const result = await send(owner.c, id, '', randomUUID(), [fileId]);
  expect({ status: result.status, code: result.body.error?.code }).toEqual({
    status: 503,
    code: 'ATTACHMENT_SCHEMA_OUTDATED',
  });
  const history = await owner.c.agent.get('/projects/' + id + '/conversation');
  expect(history.body.comments).toEqual([]);
});

it('admin participa com permissão explícita; terminais permanecem somente leitura e a conversa não altera o workflow', async () => {
  const requester = await account('REQUESTER'),
    admin = await account('ADMIN'),
    id = await createProject(requester.c);
  expect(
    (await send(admin.c, id, 'Acompanhamento administrativo.')).status,
  ).toBe(201);
  expect((await send(requester.c, id, 'Solicitação confirmada.')).status).toBe(
    201,
  );
  expect(
    (await admin.c.agent.get('/projects/' + id + '/workflow')).body.state,
  ).toBe('REQUESTED');
  const current = await requester.c.agent.get('/projects/' + id + '/workflow');
  expect(
    (
      await mutate(requester.c, '/projects/' + id + '/cancel', {
        expectedRevision: current.body.revision,
        clientOperationId: randomUUID(),
        reason: 'Encerramento sintético do cenário.',
      })
    ).status,
  ).toBe(200);
  expect(
    (await send(requester.c, id, 'Mensagem após cancelamento.')).status,
  ).toBe(409);
  const read = await requester.c.agent.get('/projects/' + id + '/conversation');
  expect(read.body.comments).toHaveLength(2);
  expect(read.body.comments.map((m: { content: string }) => m.content)).toEqual(
    ['Acompanhamento administrativo.', 'Solicitação confirmada.'],
  );
});
