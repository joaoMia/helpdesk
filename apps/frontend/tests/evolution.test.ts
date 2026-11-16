import assert from 'node:assert/strict';
import test from 'node:test';
import { authDestination } from '../src/navigation/auth-routes';
import {
  projectRequestInputSchema,
  projectQuerySchema,
  personalDashboardSchema,
} from '@helpdesk/contracts';
import { chartOptions } from '../src/lib/chart-options';
import { chartReplacement } from '../src/lib/chart-update';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Teste',
  email: 'teste@example.invalid',
  role: 'REQUESTER' as const,
  mustChangePassword: false,
};
test('projetos só aceitam solicitação, sem campos de execução ou identidade forjada', () => {
  assert.equal(
    projectRequestInputSchema.safeParse({
      title: 'Portal',
      objective: 'Objetivo de teste',
      need: 'Necessidade de teste',
    }).success,
    true,
  );
  assert.equal(
    projectRequestInputSchema.safeParse({
      title: 'Portal',
      objective: 'Objetivo de teste',
      need: 'Necessidade de teste',
      status: 'CONCLUDED',
    }).success,
    false,
  );
  assert.equal(
    projectQuerySchema.safeParse({ userId: user.id }).success,
    false,
  );
});
test('rotas de projetos mantêm perfil e recusam segmentos adicionais', () => {
  const p = '#/requester/projetos/' + user.id;
  assert.equal(authDestination(user, p), p);
  assert.equal(authDestination(user, p + '/extra'), '#/requester/painel');
  assert.equal(
    authDestination({ ...user, role: 'TECHNICIAN' }, p),
    '#/technician/painel',
  );
  assert.equal(
    authDestination({ ...user, role: 'ADMIN' }, '#/admin/projetos'),
    '#/admin/projetos',
  );
});
test('rosca e rose mantêm identidade para transição sem replacement completo', () => {
  const model = {
    kind: 'pie' as const,
    labels: ['Baixa', 'Alta'],
    ids: ['LOW', 'HIGH'],
    series: [{ name: 'Chamados', values: [2, 1] }],
  };
  const pie = chartOptions(model, false, false, 'pie'),
    rose = chartOptions(model, false, false, 'rose');
  const a = (pie.series as { id: string; universalTransition: boolean }[])[0]!,
    b = (rose.series as { id: string; universalTransition: boolean }[])[0]!;
  assert.equal(a.id, b.id);
  assert.equal(a.universalTransition, true);
  assert.equal(chartReplacement.notMerge, false);
  assert.ok(chartReplacement.replaceMerge.includes('xAxis'));
  assert.equal(
    (
      chartOptions(model, false, true, 'pie').series as {
        universalTransition: boolean;
      }[]
    )[0]!.universalTransition,
    false,
  );
});
test('dashboard não aceita indicadores ou dados fora do contrato', () => {
  assert.equal(
    personalDashboardSchema.safeParse({
      total: 0,
      triageAvailable: 0,
      byStatus: [],
      byPriority: [],
      sla: { met: 0, exceeded: 0, unknown: 0 },
      recent: [],
      updates: [],
      requesterId: user.id,
    }).success,
    false,
  );
});
