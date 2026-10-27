import { randomBytes, randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import type { UserRole } from '@helpdesk/contracts';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { authRuntime } from '../../src/modules/auth/auth.routes.js';
import { authConfig } from '../../src/modules/auth/auth.config.js';
import { hashPassword } from '../../src/modules/auth/password.js';
import { authorization } from '../../src/modules/authorization/http.js';
import { AuthorizedResources } from '../../src/modules/authorization/resources.repository.js';
import { errorHandler } from '../../src/middlewares/error-handler.js';
import { TicketService } from '../../src/modules/tickets/ticket.service.js';
import { prismaTicketRepository } from '../../src/modules/tickets/prisma-ticket.repository.js';

export const testOrigin = 'http://127.0.0.1:5173';
export async function authorizationFixture(db: PrismaClient) {
  const password = randomBytes(24).toString('base64url');
  const passwordHash = await hashPassword(password);
  async function user(role: UserRole, mustChangePassword = false) {
    return db.user.create({
      data: {
        role,
        mustChangePassword,
        passwordHash,
        name: 'Pessoa fictícia DEV-004',
        email: randomUUID() + '@example.invalid',
      },
    });
  }
  // Only the disposable helpdesk_test namespace; never a development seed.
  const users = {
    requesterA: await user('REQUESTER'),
    requesterB: await user('REQUESTER'),
    technicianA: await user('TECHNICIAN'),
    technicianB: await user('TECHNICIAN'),
    admin: await user('ADMIN'),
    otherAdmin: await user('ADMIN'),
    pending: await user('TECHNICIAN', true),
  };
  const category = await db.serviceCategory.create({
    data: { name: 'Categoria fictícia' },
  });
  const service = await db.service.create({
    data: { categoryId: category.id, name: 'Serviço fictício' },
  });
  await db.serviceFormVersion.create({
    data: {
      serviceId: service.id,
      version: 1,
      fields: {
        create: {
          key: 'context',
          label: 'Contexto reservado',
          type: 'TEXT',
          required: true,
        },
      },
    },
  });
  const tickets = new TicketService(prismaTicketRepository(db));
  const open = (requesterId: string) =>
    tickets.open(requesterId, {
      serviceId: service.id,
      subject: 'Assunto reservado fictício',
      description: 'Descrição reservada fictícia',
      answers: { context: 'Resposta privada fictícia' },
    });
  const own = await open(users.requesterA.id),
    other = await open(users.requesterB.id);
  const assignedA = await open(users.requesterA.id),
    assignedB = await open(users.requesterB.id);
  const classified = await open(users.requesterB.id),
    closed = await open(users.requesterA.id);
  for (const [ticket, technician] of [
    [assignedA, users.technicianA],
    [assignedB, users.technicianB],
    [closed, users.technicianA],
  ] as const)
    await db.ticket.update({
      where: { id: ticket.id },
      data: {
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        assignedTechnicianId: technician.id,
        firstStartedAt: new Date(),
        classifiedAt: new Date(),
        classifiedById: technician.id,
      },
    });
  await db.ticket.update({
    where: { id: classified.id },
    data: {
      priority: 'HIGH',
      classifiedAt: new Date(),
      classifiedById: users.technicianA.id,
    },
  });
  await db.ticket.update({
    where: { id: closed.id },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closedById: users.technicianA.id,
    },
  });
  const settings = authConfig(
    {
      AUTH_JWT_SECRET: randomBytes(32).toString('base64url'),
      AUTH_CSRF_SECRET: randomBytes(32).toString('base64url'),
      AUTH_ORIGINS: testOrigin,
      AUTH_COOKIE_SECURE: 'false',
      AUTH_ALLOW_LOCAL_HTTP: 'true',
    },
    'test',
  );
  function setup() {
    const service = new AuthService(new AuthRepository(db), settings);
    const auth = authRuntime(service),
      guards = authorization(auth),
      resources = new AuthorizedResources(db);
    const app = express();
    app.use(express.json({ limit: '16kb' }));
    app.use('/auth', auth.router);
    // These probes exist only under tests/. Never imported by server/createApp.
    app.get('/probe/admin', ...guards.roles('ADMIN'), (_req, res) =>
      res.sendStatus(204),
    );
    app.get('/probe/no-roles', ...guards.roles(), (_req, res) =>
      res.sendStatus(204),
    );
    app.post(
      '/probe/catalog',
      ...guards.permission('services.update'),
      (_req, res) => res.sendStatus(204),
    );
    app.get(
      '/probe/tickets',
      ...guards.permission('tickets.read'),
      async (req, res) =>
        res.json(await resources.tickets(auth.http.identity(req), req.query)),
    );
    app.get(
      '/probe/counts',
      ...guards.permission('tickets.aggregate'),
      async (req, res) =>
        res.json(
          await resources.countsByStatus(auth.http.identity(req), req.query),
        ),
    );
    app.get(
      '/probe/triage',
      ...guards.permission('tickets.triage'),
      async (req, res) =>
        res.json(await resources.triage(auth.http.identity(req), req.query)),
    );
    app.get(
      '/probe/tickets/:id',
      ...guards.permission('tickets.read'),
      async (req, res) =>
        res.json(
          await resources.ticket(auth.http.identity(req), req.params.id),
        ),
    );
    app.get(
      '/probe/users/:id',
      ...guards.permission('users.read'),
      async (req, res) =>
        res.json(await resources.user(auth.http.identity(req), req.params.id)),
    );
    app.post(
      '/probe/users/:id/update',
      ...guards.permission('users.update-self'),
      async (req, res) => {
        await resources.assertUserOperation(
          auth.http.identity(req),
          req.params.id,
          'users.update-self',
        );
        res.sendStatus(204);
      },
    );
    const actions = {
      classify: 'tickets.classify',
      start: 'tickets.start',
      update: 'tickets.update-assigned',
    } as const;
    for (const [action, operation] of Object.entries(actions))
      app.post(
        `/probe/tickets/:id/${action}`,
        ...guards.permission(operation),
        async (req, res) => {
          await resources.assertTicketOperation(
            auth.http.identity(req),
            req.params.id,
            operation,
          );
          res.sendStatus(204); // Only a policy probe; no state is changed.
        },
      );
    app.post(
      '/probe/requesters/:id/manage',
      ...guards.permission('users.update-requester'),
      async (req, res) => {
        await resources.assertUserOperation(
          auth.http.identity(req),
          req.params.id,
          'users.update-requester',
        );
        res.sendStatus(204);
      },
    );
    app.post(
      '/probe/technicians/:id/manage',
      ...guards.permission('technicians.update'),
      async (req, res) => {
        await resources.assertUserOperation(
          auth.http.identity(req),
          req.params.id,
          'technicians.update',
        );
        res.sendStatus(204);
      },
    );
    app.use(errorHandler);
    return { app, agent: request.agent(app), service, auth, resources };
  }
  return {
    users,
    serviceId: service.id,
    own,
    other,
    assignedA,
    assignedB,
    classified,
    closed,
    password,
    setup,
  };
}
export type ProbeClient = ReturnType<
  Awaited<ReturnType<typeof authorizationFixture>>['setup']
>;
export async function csrf(client: ProbeClient) {
  const response = await client.agent
    .get('/auth/csrf')
    .set('Origin', testOrigin);
  if (response.status !== 200) throw new Error('CSRF de teste indisponível.');
  return response.body.csrfToken as string;
}
export async function post(
  client: ProbeClient,
  path: string,
  body: Record<string, unknown> = {},
) {
  const token = await csrf(client);
  return client.agent
    .post(path)
    .set('Origin', testOrigin)
    .set('X-CSRF-Token', token)
    .send(body);
}
export async function signIn(
  client: ProbeClient,
  email: string,
  password: string,
) {
  const response = await post(client, '/auth/login', { email, password });
  if (response.status !== 200) throw new Error('Login da fixture falhou.');
  return response;
}
