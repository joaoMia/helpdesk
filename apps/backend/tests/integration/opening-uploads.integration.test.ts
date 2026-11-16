import { AttachmentStorage } from '../../src/modules/tickets/attachment-storage.js';
import { ConversationService } from '../../src/modules/tickets/conversation.service.js';
import { ConversationRepository } from '../../src/modules/tickets/conversation.repository.js';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { AdministrationService } from '../../src/modules/administration/administration.service.js';
import { AdministrationRepository } from '../../src/modules/administration/administration.repository.js';
import {
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
  it,
  expect,
} from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';

import { authTestDatabase } from './auth-database.js';
import { developmentFingerprint } from './review-database.js';
import { createApp } from '../../src/app.js';
import { authConfig } from '../../src/modules/auth/auth.config.js';
import { authRuntime } from '../../src/modules/auth/auth.routes.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { ProfileService } from '../../src/modules/users/profile.service.js';
import { ProfileRepository } from '../../src/modules/users/profile.repository.js';
import { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import { CatalogRepository } from '../../src/modules/catalog/catalog.repository.js';
import { TicketApiService } from '../../src/modules/tickets/ticket-api.service.js';
import { TicketApiRepository } from '../../src/modules/tickets/ticket-api.repository.js';
let storage: AttachmentStorage;
let database: Awaited<ReturnType<typeof authTestDatabase>>,
  before: Awaited<ReturnType<typeof developmentFingerprint>>;
const origin = 'http://127.0.0.1:5173',
  password = randomBytes(24).toString('base64url');
beforeAll(async () => {
  before = await developmentFingerprint();
});
beforeEach(async () => {
  database = await authTestDatabase();
  storage = new AttachmentStorage(
    join(
      fileURLToPath(new URL('../../../../.local/', import.meta.url)),
      'attachments-test-' + randomUUID(),
    ),
  );
});
afterEach(async () => {
  for (const f of await readdir(storage.root).catch(() => []))
    if (/^[a-f0-9-]{36}\.bin$/.test(f)) await storage.removeOwn(f);
  await database.dispose();
});
afterAll(async () => {
  expect(await developmentFingerprint()).toEqual(before);
});
function setup() {
  const runtime = authRuntime(
    new AuthService(
      new AuthRepository(database.db),
      authConfig(
        {
          AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
          AUTH_CSRF_SECRET: randomBytes(32).toString('base64url'),
          AUTH_ORIGINS: origin,
          AUTH_COOKIE_SECURE: 'false',
          AUTH_ALLOW_LOCAL_HTTP: 'true',
        },
        'test',
      ),
    ),
  );
  const app = createApp(
    runtime,
    new ProfileService(new ProfileRepository(database.db)),
    undefined,
    new CatalogService(new CatalogRepository(database.db)),
    new TicketApiService(new TicketApiRepository(database.db), storage),
    new AdministrationService(new AdministrationRepository(database.db)),
    new ConversationService(new ConversationRepository(database.db), storage),
  );
  return { app, agent: request.agent(app) };
}
type Client = ReturnType<typeof setup>;
async function mutate(c: Client, url: string, body: unknown, patch = false) {
  const csrf = await c.agent.get('/auth/csrf').set('Origin', origin);
  return (patch ? c.agent.patch(url) : c.agent.post(url))
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .send(body as object);
}
async function account(role: 'ADMIN' | 'TECHNICIAN' | 'REQUESTER' = 'ADMIN') {
  return database.db.user.create({
    data: {
      name: 'Pessoa fictícia',
      email: randomUUID() + '@example.invalid',
      role,
      passwordHash: await hashPassword(password),
    },
  });
}
async function logged(role: 'ADMIN' | 'TECHNICIAN' | 'REQUESTER' = 'ADMIN') {
  const user = await account(role),
    c = setup();
  expect(
    (await mutate(c, '/auth/login', { email: user.email, password })).status,
  ).toBe(200);
  return { c, user };
}

async function fixture() {
  const admin = await logged('ADMIN'),
    requester = await logged('REQUESTER');
  const cat = await mutate(admin.c, '/categories', { name: 'Suporte isolado' });
  expect(cat.status).toBe(201);
  const service = await mutate(admin.c, '/services', {
    name: 'Serviço básico',
    categoryId: cat.body.item.id,
  });
  expect(service.status).toBe(201);
  return {
    admin,
    requester,
    cat: cat.body.item,
    service: service.body.item,
    input: {
      serviceId: service.body.item.id,
      subject: 'Solicitação de teste',
      description: 'Descrição para persistência isolada',
    },
  };
}
async function formFixture() {
  const f = await fixture();
  const definition = {
    title: 'Comprovante',
    description: 'Envie imagem ou texto',
    fields: [
      {
        id: randomUUID(),
        key: 'evidence',
        label: 'Comprovante',
        type: 'FILE',
        required: true,
      },
    ],
  };
  const url = '/services/' + f.service.id + '/form';
  expect(
    (
      await mutate(
        f.admin.c,
        url + '/draft',
        { expectedRevision: 0, definition },
        true,
      )
    ).status,
  ).toBe(200);
  const pub = await mutate(f.admin.c, url + '/publish', {
    expectedRevision: 1,
  });
  expect(pub.status).toBe(201);
  return {
    ...f,
    versionId:
      pub.body.id ??
      pub.body.form?.id ??
      (await f.admin.c.agent.get(url)).body.published.id,
  };
}
async function upload(
  f: Awaited<ReturnType<typeof formFixture>>,
  c = f.requester.c,
  name = 'evidencia.txt',
  content = Buffer.from('Comprovante isolado'),
) {
  const csrf = await c.agent.get('/auth/csrf').set('Origin', origin);
  const q = new URLSearchParams({
    serviceId: f.service.id,
    formVersionId: f.versionId,
    fieldKey: 'evidence',
    name,
  });
  return c.agent
    .post('/tickets/opening-uploads?' + q)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf.body.csrfToken)
    .set('Content-Type', 'application/octet-stream')
    .send(content);
}
it('mantém os anexos no formulário e mostra uma única mensagem de abertura para os leitores autorizados', async () => {
  const f = await formFixture(),
    u = await upload(f),
    technician = await logged('TECHNICIAN'),
    other = await logged('REQUESTER');
  expect(u.status).toBe(201);
  expect(JSON.stringify(u.body)).not.toMatch(/storageKey|sha256|ownerId/);
  const image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#004f48' },
  })
    .png()
    .toBuffer();
  const png = await upload(f, f.requester.c, 'imagem.png', image);
  expect(png.status).toBe(201);
  const ids = [u.body.upload.id, png.body.upload.id];
  const o = await mutate(f.requester.c, '/tickets', {
    ...f.input,
    formVersionId: f.versionId,
    answers: { evidence: ids },
  });
  expect(o.status).toBe(201);
  expect(await database.db.openingUpload.count()).toBe(0);
  const file = await database.db.ticketAttachment.findUniqueOrThrow({
    where: { id: u.body.upload.id },
  });
  expect(file.ticketId).toBe(o.body.ticket.id);
  expect(file.isDraft).toBe(false);
  const answer = await database.db.ticketAnswer.findFirstOrThrow({
    where: { ticketId: o.body.ticket.id },
  });
  expect(answer.value).toEqual(ids);
  const url = '/tickets/' + file.ticketId;
  for (const { c } of [f.requester, f.admin, technician, f.requester]) {
    const conversation = await c.agent.get(url + '/conversation');
    expect(conversation.status).toBe(200);
    expect(conversation.body).toMatchObject({ total: 1, attachments: [] });
    expect(conversation.body.comments).toHaveLength(1);
    expect(conversation.body.comments[0]).toMatchObject({
      id: file.commentId,
      authorId: f.requester.user.id,
      authorName: f.requester.user.name,
      content: 'Anexos enviados na abertura do chamado.',
      createdAt: o.body.ticket.createdAt,
      attachments: expect.arrayContaining([
        expect.objectContaining({ id: file.id, previewable: false }),
        expect.objectContaining({ id: png.body.upload.id, previewable: true }),
      ]),
    });
    expect(conversation.body.comments[0].attachments).toHaveLength(2);
    expect((await c.agent.get(url + '/attachments/' + file.id)).status).toBe(
      200,
    );
  }
  const preview = await technician.c.agent.get(
    url + '/attachments/' + png.body.upload.id + '?preview=true',
  );
  expect(preview.status).toBe(200);
  expect(preview.headers['content-disposition']).toMatch(/^inline;/);
  expect(preview.headers['content-type']).toBe('image/png');
  expect((await other.c.agent.get(url + '/conversation')).status).toBe(404);
  expect(
    (await other.c.agent.get(url + '/attachments/' + file.id)).status,
  ).toBe(404);
  expect(await database.db.ticketAttachment.count()).toBe(2);
  expect(await database.db.ticketComment.count()).toBe(1);
  expect(
    (
      await database.db.ticket.findUniqueOrThrow({
        where: { id: file.ticketId },
      })
    ).status,
  ).toBe('OPEN');
});
it('bloqueia campo obrigatório ausente, ID fictício, arquivo de outro usuário e download cruzado', async () => {
  const f = await formFixture(),
    other = await logged('REQUESTER');
  expect((await mutate(f.requester.c, '/tickets', f.input)).status).toBe(400);
  const u = await upload(f, other.c);
  expect(u.status).toBe(201);
  for (const id of [randomUUID(), u.body.upload.id])
    expect(
      (
        await mutate(f.requester.c, '/tickets', {
          ...f.input,
          answers: { evidence: [id] },
        })
      ).status,
    ).toBe(409);
  expect(await database.db.ticket.count()).toBe(0);
  expect(await database.db.openingUpload.count()).toBe(1);
});
it('dois envios da mesma abertura com mesmo arquivo confirmam apenas um chamado', async () => {
  const f = await formFixture(),
    u = await upload(f);
  expect(u.status).toBe(201);
  const input = { ...f.input, answers: { evidence: [u.body.upload.id] } };
  const results = await Promise.all([
    mutate(f.requester.c, '/tickets', input),
    mutate(f.requester.c, '/tickets', input),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(await database.db.ticket.count()).toBe(1);
  expect(await database.db.ticketAttachment.count()).toBe(1);
  expect(await database.db.ticketComment.count()).toBe(1);
  expect(
    await database.db.ticketEvent.count({ where: { eventType: 'OPENED' } }),
  ).toBe(1);
});
it('expiração e descarte não permitem reivindicação; ADMIN e TECHNICIAN não enviam anexos de abertura', async () => {
  const f = await formFixture(),
    u = await upload(f);
  expect(u.status).toBe(201);
  await database.db.openingUpload.update({
    where: { id: u.body.upload.id },
    data: {
      createdAt: new Date(Date.now() - 3 * 86400000),
      expiresAt: new Date(Date.now() - 86400000),
    },
  });
  expect(
    (
      await mutate(f.requester.c, '/tickets', {
        ...f.input,
        answers: { evidence: [u.body.upload.id] },
      })
    ).status,
  ).toBe(409);
  const csrf = await f.requester.c.agent
    .get('/auth/csrf')
    .set('Origin', origin);
  expect(
    (
      await f.requester.c.agent
        .delete('/tickets/opening-uploads/' + u.body.upload.id)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf.body.csrfToken)
    ).status,
  ).toBe(204);
  expect(await database.db.openingUpload.count()).toBe(0);
  for (const role of ['ADMIN', 'TECHNICIAN'] as const) {
    const c = await logged(role);
    expect((await upload(f, c.c)).status).toBe(403);
  }
});
it('rejeita arquivos perigosos, CSRF ausente e versão antiga após publicação', async () => {
  const f = await formFixture();
  expect(
    (await upload(f, f.requester.c, 'arquivo.svg', Buffer.from('<svg/>')))
      .status,
  ).toBe(400);
  expect(
    (
      await f.requester.c.agent
        .post('/tickets/opening-uploads')
        .set('Origin', origin)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('Teste'))
    ).status,
  ).toBe(403);
  const u = await upload(f);
  expect(u.status).toBe(201);
  const url = '/services/' + f.service.id + '/form',
    read = (await f.admin.c.agent.get(url)).body;
  expect(
    (
      await mutate(
        f.admin.c,
        url + '/draft',
        {
          expectedRevision: 1,
          definition: {
            title: 'Nova',
            description: '',
            fields: read.published.fields,
          },
        },
        true,
      )
    ).status,
  ).toBe(200);
  expect(
    (await mutate(f.admin.c, url + '/publish', { expectedRevision: 2 })).status,
  ).toBe(201);
  expect(
    (
      await mutate(f.requester.c, '/tickets', {
        ...f.input,
        formVersionId: f.versionId,
        answers: { evidence: [u.body.upload.id] },
      })
    ).status,
  ).toBe(409);
  expect((await upload(f)).status).toBe(404);
  expect(await database.db.ticket.count()).toBe(0);
});
it('falha de auditoria reverte chamado, resposta e reivindicação sem perder o arquivo', async () => {
  const f = await formFixture(),
    u = await upload(f);
  expect(u.status).toBe(201);
  await database.db.$executeRawUnsafe(
    `CREATE FUNCTION "${database.schema}".reject_open() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$`,
  );
  await database.db.$executeRawUnsafe(
    `CREATE TRIGGER reject_open BEFORE INSERT ON "${database.schema}".ticket_events FOR EACH ROW EXECUTE FUNCTION "${database.schema}".reject_open()`,
  );
  expect(
    (
      await mutate(f.requester.c, '/tickets', {
        ...f.input,
        answers: { evidence: [u.body.upload.id] },
      })
    ).status,
  ).toBe(500);
  expect(await database.db.ticket.count()).toBe(0);
  expect(await database.db.ticketAttachment.count()).toBe(0);
  expect(await database.db.ticketComment.count()).toBe(0);
  expect(await database.db.openingUpload.count()).toBe(1);
  const staged = await database.db.openingUpload.findUniqueOrThrow({
    where: { id: u.body.upload.id },
  });
  expect(
    (await storage.get(staged.storageKey, staged.sha256)).length,
  ).toBeGreaterThan(0);
});
