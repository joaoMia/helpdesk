import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  it,
  expect,
} from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { utimes, readdir } from 'node:fs/promises';
import request from 'supertest';
import sharp from 'sharp';
import { authTestDatabase } from './auth-database.js';
import { developmentFingerprint } from './review-database.js';
import { createApp } from '../../src/app.js';
import { authRuntime } from '../../src/modules/auth/auth.routes.js';
import { authConfig } from '../../src/modules/auth/auth.config.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { TicketApiService } from '../../src/modules/tickets/ticket-api.service.js';
import { TicketApiRepository } from '../../src/modules/tickets/ticket-api.repository.js';
import { ConversationService } from '../../src/modules/tickets/conversation.service.js';
import { ConversationRepository } from '../../src/modules/tickets/conversation.repository.js';
import { AttachmentStorage } from '../../src/modules/tickets/attachment-storage.js';
const origin = 'http://127.0.0.1:5173',
  password = randomBytes(24).toString('base64url');
it('rollback de upload remove arquivo próprio; limpeza conserva referenciados e remove somente órfãos antigos', async () => {
  const f = await fixture();
  await d.db.$executeRawUnsafe(
    `CREATE FUNCTION "${d.schema}".reject_upload() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='ATTACHMENT_ADDED' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
  );
  await d.db.$executeRawUnsafe(
    `CREATE TRIGGER reject_upload BEFORE INSERT ON "${d.schema}".ticket_events FOR EACH ROW EXECUTE FUNCTION "${d.schema}".reject_upload()`,
  );
  expect(
    (await upload(f.r.c, f.id, 'teste.txt', Buffer.from('Texto isolado')))
      .status,
  ).toBe(500);
  expect(await d.db.ticketAttachment.count()).toBe(0);
  expect(await readdir(storage.root)).toHaveLength(0);
  const keep = await storage.put(Buffer.from('Referenciado isolado')),
    orphan = await storage.put(Buffer.from('Órfão isolado')),
    old = new Date(Date.now() - 2 * 86400000);
  try {
    await utimes(join(storage.root, keep.key), old, old);
    await utimes(join(storage.root, orphan.key), old, old);
    expect(await storage.cleanOrphans(new Set([keep.key]))).toBe(1);
    expect((await storage.get(keep.key, keep.sha256)).length).toBeGreaterThan(
      0,
    );
    await expect(storage.get(orphan.key, orphan.sha256)).rejects.toThrow();
  } finally {
    await storage.removeOwn(keep.key);
    await storage.removeOwn(orphan.key);
  }
});
let d: Awaited<ReturnType<typeof authTestDatabase>>,
  before: Awaited<ReturnType<typeof developmentFingerprint>>,
  storage: AttachmentStorage;
beforeAll(async () => {
  before = await developmentFingerprint();
});
beforeEach(async () => {
  d = await authTestDatabase();
  storage = new AttachmentStorage(
    join(
      fileURLToPath(new URL('../../../../.local/', import.meta.url)),
      'attachments-test-' + randomUUID(),
    ),
  );
});
afterEach(async () => {
  const files = await d.db.ticketAttachment.findMany({
    select: { storageKey: true },
  });
  for (const f of files) await storage.removeOwn(f.storageKey);
  await d.dispose();
});
afterAll(async () => {
  expect(await developmentFingerprint()).toEqual(before);
});
function setup() {
  const auth = authRuntime(
    new AuthService(
      new AuthRepository(d.db),
      authConfig(
        {
          AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
          AUTH_CSRF_SECRET: randomBytes(32).toString('base64url'),
          AUTH_ORIGINS: origin,
          AUTH_ALLOW_LOCAL_HTTP: 'true',
          AUTH_COOKIE_SECURE: 'false',
        },
        'test',
      ),
    ),
  );
  const app = createApp(
    auth,
    undefined,
    undefined,
    undefined,
    new TicketApiService(new TicketApiRepository(d.db)),
    undefined,
    new ConversationService(new ConversationRepository(d.db), storage),
  );
  return { app, agent: request.agent(app) };
}
type C = ReturnType<typeof setup>;
async function mutate(c: C, url: string, body: object) {
  const s = await c.agent.get('/auth/csrf').set('Origin', origin);
  return c.agent
    .post(url)
    .set('Origin', origin)
    .set('X-CSRF-Token', s.body.csrfToken)
    .send(body);
}
async function account(role: 'REQUESTER' | 'TECHNICIAN' | 'ADMIN') {
  const u = await d.db.user.create({
    data: {
      name: role + ' isolado',
      email: randomUUID() + '@example.invalid',
      role,
      passwordHash: await hashPassword(password),
    },
  });
  const c = setup();
  expect(
    (await mutate(c, '/auth/login', { email: u.email, password })).status,
  ).toBe(200);
  return { u, c };
}
async function fixture() {
  const r = await account('REQUESTER'),
    t = await account('TECHNICIAN');
  const cat = await d.db.serviceCategory.create({
    data: { name: 'Suporte isolado' },
  });
  const svc = await d.db.service.create({
    data: {
      name: 'Serviço isolado',
      categoryId: cat.id,
      forms: { create: { version: 1 } },
    },
  });
  const opened = await mutate(r.c, '/tickets', {
    serviceId: svc.id,
    subject: 'Assunto isolado',
    description: 'Descrição isolada',
  });
  expect(opened.status).toBe(201);
  const id = opened.body.ticket.id as string;
  return { r, t, id };
}
async function started(f: Awaited<ReturnType<typeof fixture>>) {
  const token = (await f.t.c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  expect(
    (
      await f.t.c.agent
        .patch('/tickets/' + f.id + '/priority')
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
        .send({ priority: 'HIGH', expectedPriority: null })
    ).status,
  ).toBe(200);
  expect((await mutate(f.t.c, '/tickets/' + f.id + '/start', {})).status).toBe(
    200,
  );
}
async function upload(c: C, id: string, name: string, body: Buffer) {
  const s = await c.agent.get('/auth/csrf').set('Origin', origin);
  return c.agent
    .post('/tickets/' + id + '/attachments?name=' + encodeURIComponent(name))
    .set('Origin', origin)
    .set('X-CSRF-Token', s.body.csrfToken)
    .set('Content-Type', 'application/octet-stream')
    .send(body);
}
it('comentário persiste; outro solicitante não consulta e técnico autorizado lê e participa', async () => {
  const f = await fixture();
  expect(
    (
      await mutate(f.r.c, '/tickets/' + f.id + '/comments', {
        content: 'Comentário real',
      })
    ).status,
  ).toBe(201);
  const own = await f.r.c.agent.get('/tickets/' + f.id + '/conversation');
  expect(own.status).toBe(200);
  expect(own.body.comments[0]).toMatchObject({
    content: 'Comentário real',
    authorId: f.r.u.id,
  });
  const other = await account('REQUESTER');
  expect(
    (await other.c.agent.get('/tickets/' + f.id + '/conversation')).status,
  ).toBe(404);
  expect(
    (
      await mutate(other.c, '/tickets/' + f.id + '/comments', {
        content: 'Mensagem fora do escopo',
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/comments', {
        content: 'Resposta técnica antes do atendimento',
      })
    ).status,
  ).toBe(201);
  expect(await d.db.ticket.findUnique({ where: { id: f.id } })).toMatchObject({
    status: 'OPEN',
    firstStartedAt: null,
    assignedTechnicianId: null,
  });
  const owner = await account('TECHNICIAN');
  await d.db.ticket.update({
    where: { id: f.id },
    data: {
      priority: 'LOW',
      assignedTechnicianId: owner.u.id,
      status: 'IN_PROGRESS',
      firstStartedAt: new Date(),
    },
  });
  expect(
    (await f.t.c.agent.get('/tickets/' + f.id + '/conversation')).status,
  ).toBe(200);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/comments', {
        content: 'Resposta de outro técnico autorizado',
      })
    ).status,
  ).toBe(201);
  expect(
    await d.db.ticketEvent.count({
      where: { ticketId: f.id, eventType: 'COMMENT_ADDED' },
    }),
  ).toBe(3);
});
it('responsável e ADMIN comentam com autoria e anexos; payload e CSRF estritos', async () => {
  const f = await fixture();
  await started(f);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/comments', {
        content: 'Resposta técnica',
      })
    ).status,
  ).toBe(201);
  const a = await account('ADMIN');
  expect(
    (await a.c.agent.get('/tickets/' + f.id + '/conversation')).status,
  ).toBe(200);
  const attachment = await upload(
    a.c,
    f.id,
    'orientacao.txt',
    Buffer.from('Orientação administrativa'),
  );
  expect(attachment.status).toBe(201);
  const attachmentId = attachment.body.attachment.id;
  expect(
    (
      await mutate(a.c, '/tickets/' + f.id + '/comments', {
        content: 'Orientação administrativa',
        attachmentIds: [attachmentId],
      })
    ).status,
  ).toBe(201);
  const conversation = await f.r.c.agent.get(
    '/tickets/' + f.id + '/conversation',
  );
  expect(conversation.body.comments).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        authorId: a.u.id,
        content: 'Orientação administrativa',
        attachments: [expect.objectContaining({ id: attachmentId })],
      }),
    ]),
  );
  expect(
    (
      await mutate(f.r.c, '/tickets/' + f.id + '/comments', {
        content: 'x',
        authorId: a.u.id,
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await f.r.c.agent
        .post('/tickets/' + f.id + '/comments')
        .set('Origin', origin)
        .send({ content: 'x' })
    ).status,
  ).toBe(403);
});
it('imagem é decodificada, regravada sem metadados e entregue autenticada; texto só download', async () => {
  const f = await fixture();
  const image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: 'red' },
  })
    .jpeg()
    .toBuffer();
  const u = await upload(f.r.c, f.id, 'foto.jpg', image);
  expect(u.status).toBe(201);
  expect(u.body.attachment).toMatchObject({
    mime: 'image/png',
    name: 'foto.png',
    previewable: true,
  });
  expect(JSON.stringify(u.body)).not.toMatch(/storageKey|sha256|passwordHash/);
  const id = u.body.attachment.id;
  const get = await f.r.c.agent.get(
    '/tickets/' + f.id + '/attachments/' + id + '?preview=true',
  );
  expect(get.status).toBe(200);
  expect(get.headers['content-type']).toContain('image/png');
  expect(get.headers['x-content-type-options']).toBe('nosniff');
  expect(
    (await request(f.r.c.app).get('/tickets/' + f.id + '/attachments/' + id))
      .status,
  ).toBe(401);
  const other = await account('REQUESTER');
  expect(
    (await other.c.agent.get('/tickets/' + f.id + '/attachments/' + id)).status,
  ).toBe(404);
  const txt = await upload(
    f.r.c,
    f.id,
    'registro.txt',
    Buffer.from('Texto inofensivo'),
  );
  expect(txt.status).toBe(201);
  expect(
    (
      await f.r.c.agent.get(
        '/tickets/' +
          f.id +
          '/attachments/' +
          txt.body.attachment.id +
          '?preview=true',
      )
    ).headers['content-disposition'],
  ).toContain('attachment;');
});
it('SVG, HTML, executável, extensão falsa, texto ativo e excesso são rejeitados sem arquivos vinculados', async () => {
  const f = await fixture();
  for (const [name, body] of [
    ['x.svg', '<svg/>'],
    ['x.html', '<html/>'],
    ['x.exe', 'MZ'],
    ['x.png', 'fake png'],
    ['x.txt', '<script>alert(1)</script>'],
  ] as const)
    expect((await upload(f.r.c, f.id, name, Buffer.from(body))).status).toBe(
      400,
    );
  expect(await d.db.ticketAttachment.count()).toBe(0);
  expect(
    (
      await upload(
        f.r.c,
        f.id,
        'large.txt',
        Buffer.alloc(10 * 1024 * 1024 + 1, 65),
      )
    ).status,
  ).toBe(413);
});
it('solução exige responsável/início, preserva snapshots e é distinta do encerramento', async () => {
  const f = await fixture();
  expect(
    (
      await mutate(f.r.c, '/tickets/' + f.id + '/solution', {
        description: 'Solução',
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/solution', {
        description: 'Solução',
      })
    ).status,
  ).toBe(409);
  await started(f);
  const before = await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } });
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/solution', {
        description: 'Correção concluída',
      })
    ).status,
  ).toBe(201);
  const after = await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } });
  expect(after.status).toBe('RESOLVED');
  expect(after.closedAt).toBeNull();
  expect(after.resolvedAt).not.toBeNull();
  expect(after.serviceSnapshot).toEqual(before.serviceSnapshot);
  expect(after.firstStartedAt).toEqual(before.firstStartedAt);
  expect(
    (await f.r.c.agent.get('/tickets/' + f.id + '/conversation')).body.solution
      .description,
  ).toBe('Correção concluída');
  expect((await f.r.c.agent.get('/tickets/' + f.id)).body.ticket.status).toBe(
    'RESOLVED',
  );
});
it('soluções concorrentes deixam uma solução e um evento; nenhuma atualização parcial', async () => {
  const f = await fixture();
  await started(f);
  const r = await Promise.all([
    mutate(f.t.c, '/tickets/' + f.id + '/solution', {
      description: 'Solução A',
    }),
    mutate(f.t.c, '/tickets/' + f.id + '/solution', {
      description: 'Solução B',
    }),
  ]);
  expect(r.map((x) => x.status).sort()).toEqual([201, 409]);
  expect(await d.db.ticketSolution.count({ where: { ticketId: f.id } })).toBe(
    1,
  );
  expect(
    await d.db.ticketEvent.count({
      where: { ticketId: f.id, eventType: 'SOLUTION_ADDED' },
    }),
  ).toBe(1);
});
it('falha da auditoria desfaz solução/status; anexos de terceiros não são vinculados', async () => {
  const f = await fixture();
  await started(f);
  await d.db.$executeRawUnsafe(
    `CREATE FUNCTION "${d.schema}".reject_solution_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='SOLUTION_ADDED' THEN RAISE EXCEPTION 'test rollback'; END IF; RETURN NEW; END $$`,
  );
  await d.db.$executeRawUnsafe(
    `CREATE TRIGGER reject_solution_event BEFORE INSERT ON "${d.schema}".ticket_events FOR EACH ROW EXECUTE FUNCTION "${d.schema}".reject_solution_event()`,
  );
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/solution', {
        description: 'Deve falhar',
      })
    ).status,
  ).toBe(500);
  expect(
    (await d.db.ticket.findUniqueOrThrow({ where: { id: f.id } })).status,
  ).toBe('IN_PROGRESS');
  expect(await d.db.ticketSolution.count()).toBe(0);
  const a = await upload(f.r.c, f.id, 'a.txt', Buffer.from('teste'));
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/comments', {
        content: 'Referência indevida',
        attachmentIds: [a.body.attachment.id],
      })
    ).status,
  ).toBe(409);
  expect(await d.db.ticketComment.count()).toBe(0);
});
it('rascunhos são privados, vinculados ao enviar, descartáveis somente pelo autor e bloqueados após solução', async () => {
  const f = await fixture();
  await started(f);
  const csrf = (await f.r.c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  const upload = await f.r.c.agent
    .post('/tickets/' + f.id + '/attachments?draft=true&name=privado.txt')
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from('Rascunho privado'));
  expect(upload.status).toBe(201);
  const file = upload.body.attachment;
  expect(
    (await d.db.ticketAttachment.findUniqueOrThrow({ where: { id: file.id } }))
      .isDraft,
  ).toBe(true);
  expect(
    (await f.t.c.agent.get('/tickets/' + f.id + '/conversation')).body
      .attachments,
  ).toHaveLength(0);
  expect(
    (await f.t.c.agent.get('/tickets/' + f.id + '/attachments/' + file.id))
      .status,
  ).toBe(404);
  expect(
    (
      await f.r.c.agent
        .delete('/tickets/' + f.id + '/attachments/' + file.id + '/draft')
        .set('Origin', origin)
    ).status,
  ).toBe(403);
  expect(
    (
      await mutate(f.r.c, '/tickets/' + f.id + '/comments', {
        content: 'Mensagem com anexo',
        attachmentIds: [file.id],
      })
    ).status,
  ).toBe(201);
  expect(
    (await d.db.ticketAttachment.findUniqueOrThrow({ where: { id: file.id } }))
      .isDraft,
  ).toBe(false);
  expect(
    (await f.t.c.agent.get('/tickets/' + f.id + '/conversation')).body
      .comments[0].attachments[0].id,
  ).toBe(file.id);
  const reader = await account('TECHNICIAN');
  expect(
    (await reader.c.agent.get('/tickets/' + f.id + '/conversation')).status,
  ).toBe(200);
  expect(
    (await reader.c.agent.get('/tickets/' + f.id + '/attachments/' + file.id))
      .status,
  ).toBe(200);
  const next = (await f.r.c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  expect(
    (
      await f.r.c.agent
        .delete('/tickets/' + f.id + '/attachments/' + file.id + '/draft')
        .set('Origin', origin)
        .set('X-CSRF-Token', next)
    ).status,
  ).toBe(404);
  const draftAfterConflict = await f.r.c.agent
    .post('/tickets/' + f.id + '/attachments?draft=true&name=temporario.txt')
    .set('Origin', origin)
    .set('X-CSRF-Token', next)
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from('Rascunho ainda não publicado'));
  expect(draftAfterConflict.status).toBe(201);
  expect(
    (
      await mutate(f.t.c, '/tickets/' + f.id + '/solution', {
        description: 'Solução real',
      })
    ).status,
  ).toBe(201);
  expect(
    (
      await mutate(f.r.c, '/tickets/' + f.id + '/comments', {
        content: 'Não permitido após solução',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await f.r.c.agent
        .delete(
          '/tickets/' +
            f.id +
            '/attachments/' +
            draftAfterConflict.body.attachment.id +
            '/draft',
        )
        .set('Origin', origin)
        .set('X-CSRF-Token', next)
    ).status,
  ).toBe(204);
});
it('SSE sincroniza duas instâncias pelo PostgreSQL, recupera reconexão e encerra sessão revogada', async () => {
  const f = await fixture();
  await started(f);
  const outsider = await account('REQUESTER');
  expect(
    (await outsider.c.agent.get('/tickets/' + f.id + '/conversation/stream'))
      .status,
  ).toBe(404);
  const server = f.r.c.app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const url = 'http://127.0.0.1:' + address.port;
  const cookie = f.r.c.agent.jar
    .getCookies({
      domain: '127.0.0.1',
      path: '/',
      secure: false,
      script: false,
    })
    .toValueString();
  const controller = new AbortController();
  try {
    const response = await fetch(
      url + '/tickets/' + f.id + '/conversation/stream',
      {
        headers: { Cookie: cookie, Origin: origin },
        signal: controller.signal,
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader(),
      decoder = new TextDecoder();
    const frame = async () => {
      let text = '';
      while (!text.includes('event:')) {
        const read = await reader.read();
        if (read.done) throw Error('stream closed');
        text += decoder.decode(read.value);
      }
      return text;
    };
    expect(await frame()).toContain('event: sync');
    expect(
      (
        await mutate(f.t.c, '/tickets/' + f.id + '/comments', {
          content: 'Outra instância gravou',
        })
      ).status,
    ).toBe(201);
    expect(await frame()).toContain('event: sync');
    const conversation = await f.r.c.agent.get(
      '/tickets/' + f.id + '/conversation',
    );
    expect(conversation.body.comments).toHaveLength(1);
    await d.db.authSession.updateMany({
      where: { userId: f.r.u.id },
      data: { revokedAt: new Date() },
    });
    expect(await frame()).toContain('event: unavailable');
    expect(
      (await f.r.c.agent.get('/tickets/' + f.id + '/conversation/stream'))
        .status,
    ).toBe(401);
    await reader.cancel();
  } finally {
    controller.abort();
    await new Promise<void>((resolve, reject) =>
      server.close((e) => (e ? reject(e) : resolve())),
    );
  }
});
it('duas sessões recebem mensagens em ambas direções; reconexão e novo login recuperam sem duplicação', async () => {
  const f = await fixture();
  await started(f);
  const servers = [
    f.r.c.app.listen(0, '127.0.0.1'),
    f.t.c.app.listen(0, '127.0.0.1'),
  ];
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => server.once('listening', resolve)),
    ),
  );
  const controllers: AbortController[] = [];
  async function connect(c: C, index: number) {
    const controller = new AbortController();
    controllers.push(controller);
    const cookie = c.agent.jar
      .getCookies({
        domain: '127.0.0.1',
        path: '/',
        secure: false,
        script: false,
      })
      .toValueString();
    const port = (servers[index]!.address() as { port: number }).port;
    const response = await fetch(
      'http://127.0.0.1:' + port + '/tickets/' + f.id + '/conversation/stream',
      {
        headers: { Cookie: cookie, Origin: origin },
        signal: controller.signal,
      },
    );
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    return {
      reader,
      async frame() {
        let text = '';
        while (!text.includes('event: sync')) {
          const next = await reader.read();
          if (next.done) throw Error('Conexão encerrada');
          text += new TextDecoder().decode(next.value);
        }
        return text;
      },
    };
  }
  try {
    const r = await connect(f.r.c, 0),
      t = await connect(f.t.c, 1);
    await r.frame();
    await t.frame();
    expect(
      (
        await mutate(f.r.c, '/tickets/' + f.id + '/comments', {
          content: 'Mensagem do solicitante',
        })
      ).status,
    ).toBe(201);
    await t.frame();
    await r.frame();
    expect(
      (
        await mutate(f.t.c, '/tickets/' + f.id + '/comments', {
          content: 'Resposta do técnico',
        })
      ).status,
    ).toBe(201);
    await r.frame();
    await t.frame();
    await r.reader.cancel();
    expect(
      (
        await mutate(f.t.c, '/tickets/' + f.id + '/comments', {
          content: 'Enquanto a conexão estava ausente',
        })
      ).status,
    ).toBe(201);
    await t.frame();
    const reconnected = await connect(f.r.c, 0);
    await reconnected.frame();
    const again = setup();
    expect(
      (await mutate(again, '/auth/login', { email: f.r.u.email, password }))
        .status,
    ).toBe(200);
    const read = await again.agent.get('/tickets/' + f.id + '/conversation');
    expect(read.body.comments).toHaveLength(3);
    expect(
      new Set(read.body.comments.map((m: { id: string }) => m.id)).size,
    ).toBe(3);
    await reconnected.reader.cancel();
    await t.reader.cancel();
  } finally {
    controllers.forEach((c) => c.abort());
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((e) => (e ? reject(e) : resolve())),
          ),
      ),
    );
  }
});
it('limpeza de rascunhos expirados preserva anexos históricos e rascunhos recentes', async () => {
  const { cleanExpiredDrafts } =
    await import('../../src/modules/tickets/attachment-drafts.js');
  const f = await fixture();
  const kept = await upload(
    f.r.c,
    f.id,
    'historico.txt',
    Buffer.from('Histórico preservado'),
  );
  expect(kept.status).toBe(201);
  const csrf = (await f.r.c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  async function draft() {
    return f.r.c.agent
      .post('/tickets/' + f.id + '/attachments?draft=true&name=rascunho.txt')
      .set('Origin', origin)
      .set('X-CSRF-Token', csrf)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('Rascunho'));
  }
  const stale = await draft(),
    recent = await draft();
  expect(stale.status).toBe(201);
  expect(recent.status).toBe(201);
  await d.db.ticketAttachment.update({
    where: { id: stale.body.attachment.id },
    data: { createdAt: new Date(Date.now() - 2 * 86400000) },
  });
  expect(await cleanExpiredDrafts(d.db, storage)).toBe(1);
  expect(await d.db.ticketAttachment.count()).toBe(2);
  expect(
    await d.db.ticketAttachment.findUnique({
      where: { id: kept.body.attachment.id },
    }),
  ).not.toBeNull();
});
it('identificador de mensagem evita duplicação em repetição e concorrência; payload diferente conflita', async () => {
  const f = await fixture(),
    key = randomUUID(),
    body = { content: 'Mensagem idempotente', clientMessageId: key };
  const responses = await Promise.all([
    mutate(f.r.c, '/tickets/' + f.id + '/comments', body),
    mutate(f.r.c, '/tickets/' + f.id + '/comments', body),
  ]);
  expect(responses.some((r) => r.status === 201)).toBe(true);
  expect(responses.every((r) => [201, 409].includes(r.status))).toBe(true);
  const again = await mutate(f.r.c, '/tickets/' + f.id + '/comments', body);
  expect(again.status).toBe(201);
  expect(await d.db.ticketComment.count({ where: { ticketId: f.id } })).toBe(1);
  expect(
    await d.db.ticketEvent.count({
      where: { ticketId: f.id, eventType: 'COMMENT_ADDED' },
    }),
  ).toBe(1);
  expect(
    (
      await mutate(f.r.c, '/tickets/' + f.id + '/comments', {
        ...body,
        content: 'Outro conteúdo',
      })
    ).status,
  ).toBe(409);
});
