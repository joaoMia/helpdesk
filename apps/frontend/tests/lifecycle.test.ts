import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  pendingInputSchema,
  pendingReasonUpdateSchema,
  slaPolicyInputSchema,
  dashboardQuerySchema,
  metricSnapshotSchema,
  ticketMetricsSchema,
} from '@helpdesk/contracts';
import { createAuthClient } from '../src/lib/auth-client';
import { authDestination } from '../src/navigation/auth-routes';
import {
  TicketAttendanceDates,
  TicketLifecycle,
} from '../src/components/ticket-lifecycle';
import { TicketOpenActions } from '../src/components/ticket-open-actions';
import { AdminDashboard } from '../src/pages/admin-dashboard';
Object.assign(globalThis, { React });
const id = '90000000-0000-4000-8000-000000000001',
  stamp = '2026-10-30T00:00:00.000Z';
test('ciclo: schemas recusam payload privilegiado e metas inválidas; B pode ser nula antes de iniciar', () => {
  assert.equal(
    pendingInputSchema.safeParse({
      reasonId: id,
      justification: ' ',
      role: 'ADMIN',
    }).success,
    false,
  );
  assert.equal(
    slaPolicyInputSchema.safeParse({ priority: 'HIGH', targetMinutes: 0 })
      .success,
    false,
  );
  assert.deepEqual(
    pendingReasonUpdateSchema.parse({ name: 'Motivo alterado' }),
    { name: 'Motivo alterado' },
  );
  assert.equal(
    dashboardQuerySchema.safeParse({ from: '2026-12-31', to: '2026-01-01' })
      .success,
    false,
  );
  assert.equal(
    metricSnapshotSchema.safeParse({
      engineVersion: 1,
      asOf: stamp,
      aSeconds: 0,
      bSeconds: null,
      complete: true,
      calendarSegmentIds: [],
      pendingPeriodIds: [],
    }).success,
    true,
  );
});
test('ciclo: apenas ADMIN abre políticas, dashboard e detalhe global; URL não muda perfil', () => {
  for (const role of ['ADMIN', 'TECHNICIAN', 'REQUESTER'] as const) {
    const u = {
      id,
      name: 'Isolado',
      email: 'isolado@example.invalid',
      role,
      mustChangePassword: false,
    };
    for (const path of ['#/admin/usuarios/politicas', '#/admin/chamado/' + id])
      assert.equal(
        authDestination(u, path),
        role === 'ADMIN'
          ? path
          : role === 'TECHNICIAN'
            ? '#/technician/painel'
            : '#/requester/painel',
      );
    assert.equal(
      authDestination({ ...u, mustChangePassword: true }, '#/admin/painel'),
      '#/change-password',
    );
  }
});
test('ciclo: escrita usa CSRF/cookies; falha de rede não repete fechamento', async () => {
  const calls: { url: string; options?: RequestInit }[] = [];
  const c = createAuthClient(async (url, options) => {
    calls.push({ url: String(url), options });
    return Response.json(
      String(url).endsWith('/csrf')
        ? { csrfToken: 'test-csrf' }
        : { ticket: { id, status: 'CLOSED' } },
    );
  });
  await c.ticketTransition(id, 'close');
  const op = calls.find((r) => r.url.endsWith('/close'))!;
  assert.equal(op.options?.credentials, 'include');
  assert.deepEqual(JSON.parse(op.options?.body as string), {});
  assert.equal(
    (op.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'test-csrf',
  );
  let writes = 0;
  const broken = createAuthClient(async (url) => {
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'test-csrf' });
    writes++;
    throw new TypeError('network');
  });
  await assert.rejects(broken.ticketTransition(id, 'close'));
  assert.equal(writes, 1);
});
test('dashboard: cliente mantém filtros combinados na consulta real sem dados demonstrativos', async () => {
  let request = '';
  const c = createAuthClient(async (url, options) => {
    request = String(url);
    assert.equal(options?.credentials, 'include');
    return Response.json({
      total: 0,
      byStatus: [],
      byPriority: [],
      byCompany: [],
      byDepartment: [],
      byTechnician: [],
      monthly: [],
      slaMet: 0,
      slaExceeded: 0,
      slaUnknown: 0,
      averageASeconds: null,
      averageBSeconds: null,
      finalMetricsCount: 0,
    });
  });
  const r = await c.dashboard({
    from: '2026-01-01',
    to: '2026-12-31',
    companyId: id,
    priority: 'HIGH',
    status: 'RESOLVED',
  });
  assert.equal(r.total, 0);
  const q = new URL(request, 'http://localhost').searchParams;
  assert.equal(q.get('companyId'), id);
  assert.equal(q.get('status'), 'RESOLVED');
  assert.equal(q.get('priority'), 'HIGH');
});
test('ciclo: componente mantém painel e ações por papel sem conceder autorização no navegador', () => {
  const requester = renderToStaticMarkup(
    React.createElement(TicketLifecycle, {
      id,
      status: 'IN_PROGRESS',
      createdAt: stamp,
      resolvedAt: null,
      onExpired: () => {},
      onChanged: () => {},
    }),
  );
  assert.match(requester, /Datas registradas e limite de solução configurado/);
  assert.doesNotMatch(requester, /Métrica A|Métrica B|calendário histórico/);
  assert.doesNotMatch(requester, /Colocar em pendência|Encerrar chamado/);
  const tech = renderToStaticMarkup(
    React.createElement(TicketLifecycle, {
      id,
      status: 'IN_PROGRESS',
      createdAt: stamp,
      resolvedAt: null,
      canOperate: true,
      onExpired: () => {},
      onChanged: () => {},
    }),
  );
  assert.match(tech, /Colocar em pendência/);
  const admin = renderToStaticMarkup(
    React.createElement(TicketLifecycle, {
      id,
      status: 'RESOLVED',
      createdAt: stamp,
      resolvedAt: stamp,
      canClose: true,
      onExpired: () => {},
      onChanged: () => {},
    }),
  );
  assert.match(admin, /<button[^>]*disabled[^>]*>Encerrar chamado<\/button>/);
  assert.match(admin, /Consultando métricas/);
  assert.doesNotMatch(admin, /lacuna histórica/);
  assert.doesNotMatch(admin, /Colocar em pendência/);
});
test('chamado aberto atribuído exibe início somente para o técnico responsável', () => {
  const other = '90000000-0000-4000-8000-000000000002';
  const assigned = {
    id,
    code: 14,
    status: 'OPEN' as const,
    priority: 'MEDIUM' as const,
    assignedTechnicianId: id,
    firstStartedAt: null,
  };
  const actions = (
    role: 'ADMIN' | 'TECHNICIAN' | 'REQUESTER',
    actorId: string,
    ticket = assigned as Parameters<typeof TicketOpenActions>[0]['ticket'],
  ) =>
    renderToStaticMarkup(
      React.createElement(TicketOpenActions, {
        ticket,
        user: { role, id: actorId },
        onExpired: () => {},
        onChanged: () => {},
      }),
    );
  assert.match(actions('TECHNICIAN', id), /Iniciar atendimento/);
  assert.match(actions('TECHNICIAN', id), /Alterar prioridade/);
  assert.doesNotMatch(actions('TECHNICIAN', other), /<button/);
  assert.doesNotMatch(actions('ADMIN', other), /<button/);
  assert.equal(actions('REQUESTER', id), '');
  const free = { ...assigned, assignedTechnicianId: null };
  assert.match(
    actions('TECHNICIAN', id, free),
    /Assumir e iniciar atendimento/,
  );
  assert.match(actions('ADMIN', id, free), /Atribuir chamado/);
  assert.doesNotMatch(actions('ADMIN', id, free), /Assumir/);
});
test('Atendimento exibe a data limite com a meta ou o motivo específico de ausência', () => {
  const limit = '2026-10-30T18:00:00.000Z';
  const data = ticketMetricsSchema.parse({
    metrics: {
      engineVersion: 1,
      asOf: stamp,
      aSeconds: null,
      bSeconds: 0,
      complete: false,
      calendarSegmentIds: [],
      pendingPeriodIds: [],
    },
    solutionDeadlineAt: limit,
    solutionDeadlineReason: null,
    frozen: false,
    sla: [
      {
        id,
        priority: 'MEDIUM',
        targetMinutes: 960,
        policyVersion: 1,
        startedAt: stamp,
        endedAt: null,
        consumedSeconds: 0,
        remainingSeconds: 57600,
        met: null,
        finishReason: null,
      },
    ],
    activePending: null,
  });
  const html = renderToStaticMarkup(
    React.createElement(TicketAttendanceDates, { data, createdAt: stamp }),
  );
  assert.match(html, /dateTime="2026-10-30T18:00:00.000Z"/);
  assert.match(html, /16h 0min úteis/);
  assert.match(html, /Ainda não solucionado/);
  const missing = renderToStaticMarkup(
    React.createElement(TicketAttendanceDates, {
      data: {
        ...data,
        solutionDeadlineAt: null,
        solutionDeadlineReason: 'CALENDAR_GAP',
      },
    }),
  );
  assert.match(missing, /Falta cobertura de calendário/);
  assert.match(missing, /16h 0min úteis/);
});
test('dashboard: composição inicial conserva filtros rotulados, layout responsivo e carregamento acessível', () => {
  const html = renderToStaticMarkup(
    React.createElement(AdminDashboard, { onExpired: () => {} }),
  );
  assert.match(html, /xl:grid-cols-4/);
  assert.match(html, /Filtros do dashboard/);
  assert.match(html, /role="status"/);
  assert.match(html, /Empresa/);
  assert.match(html, /Setor/);
  assert.match(html, /Prioridade/);
  assert.match(html, /O SLA mede o tempo até a solução/);
  assert.match(html, /apenas chamados encerrados com métricas finais/);
  assert.doesNotMatch(html, /Na amostra demonstrativa/);
});
