import { ProjectService } from '../../src/modules/projects/project.service.js';
import { ProjectRepository } from '../../src/modules/projects/project.repository.js';
import { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import { CatalogRepository } from '../../src/modules/catalog/catalog.repository.js';
import { AdministrationService } from '../../src/modules/administration/administration.service.js';
import { AdministrationRepository } from '../../src/modules/administration/administration.repository.js';
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  expect,
} from '@jest/globals';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import request from 'supertest';
import { LifecycleService } from '../../src/modules/tickets/lifecycle.service.js';
import { LifecycleRepository } from '../../src/modules/tickets/lifecycle.repository.js';
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
  for (const f of await d.db.projectAttachment.findMany({
    select: { storageKey: true },
  }))
    await storage.removeOwn(f.storageKey);
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
    new CatalogService(new CatalogRepository(d.db)),
    new TicketApiService(new TicketApiRepository(d.db)),
    new AdministrationService(new AdministrationRepository(d.db)),
    new ConversationService(new ConversationRepository(d.db), storage),
    new LifecycleService(new LifecycleRepository(d.db)),
    new ProjectService(new ProjectRepository(d.db, storage)),
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
async function fixture(configured = true) {
  const r = await account('REQUESTER'),
    t = await account('TECHNICIAN');
  if (configured) {
    const schedule = await d.db.workSchedule.create({
      data: {
        name: 'Expediente isolado',
        versions: {
          create: {
            version: 1,
            timezone: 'UTC',
            weekly: Array.from({ length: 7 }, (_, day) => ({
              day,
              startMinute: 0,
              endMinute: 1440,
            })),
            exceptions: [],
          },
        },
      },
    });
    await d.db.organizationSettings.create({
      data: { id: 'organization', workScheduleId: schedule.id },
    });
  }
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
export { d, fixture, account, mutate, started, upload, origin, storage };
