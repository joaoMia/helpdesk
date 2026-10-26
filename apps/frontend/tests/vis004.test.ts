import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chartOptions,
  availableChartModes,
  hasChartData,
} from '../src/lib/chart-options';
import { dashboardData, closedTimeExamples } from '../src/mocks/dashboard-data';
import type { ChartMode } from '../src/mocks/dashboard-data';
import { initialTickets } from '../src/mocks/fixtures';
import {
  initialProjects,
  projectProgressSummary,
  updateProjectProgress,
} from '../src/mocks/projects';
import {
  initialPeople,
  savePerson,
  togglePerson,
  validatePerson,
} from '../src/mocks/people';
import { validateDemoLogin, loginScenarioError } from '../src/mocks/login-demo';
import {
  localDateInput,
  localToInstant,
  validateEffectiveDate,
} from '../src/mocks/completion';
import { simulate } from '../src/mocks/simulation';
import { motionReduced } from '../src/lib/motion';

test('Rose, rosca e barras mantêm os quatro estados, valores e identificadores', () => {
  const model = dashboardData(
    'admin',
    initialTickets(),
    initialProjects(),
  ).status;
  const data = (mode: ChartMode) =>
    (
      chartOptions(model, false, false, mode).series as {
        id: string;
        data: { id: string; value: number }[];
      }[]
    )[0]!;
  for (const mode of ['rose', 'pie', 'bar'] as const) {
    assert.equal(data(mode).id, 'series-0');
    assert.equal(data(mode).data.length, 4);
    assert.deepEqual(
      data(mode).data.map((p) => p.value),
      model.series[0]!.values,
    );
    assert.deepEqual(
      data(mode).data.map((p) => p.id),
      model.labels,
    );
  }
  assert(availableChartModes(model).includes('table'));
});
test('série temporal permite combinado/barras/linhas/tabela e conta criação e encerramento separadamente', () => {
  const tickets = initialTickets(),
    data = dashboardData('admin', tickets, initialProjects(), 3);
  assert.deepEqual(availableChartModes(data.evolution), [
    'mixed',
    'bar',
    'line',
    'table',
  ]);
  assert.equal(data.evolution.labels.length, 3);
  assert.equal(
    data.evolution.series[0]!.values.reduce((a, b) => a + b, 0),
    data.own.length,
  );
  assert.equal(
    data.evolution.series[1]!.values.reduce((a, b) => a + b, 0),
    data.closedInPeriod.length,
  );
  const options = chartOptions(data.evolution, true, false);
  assert.deepEqual(
    (options.series as { type: string }[]).map((s) => s.type),
    ['bar', 'bar', 'line'],
  );
  const older = tickets.find((t) => t.id === '1000')!;
  const late = { ...older, closedAt: '2026-10-20T12:00:00Z' };
  const scoped = dashboardData('admin', [late], [], 3);
  assert.equal(scoped.own.length, 0);
  assert.equal(scoped.closedInPeriod.length, 1);
});
test('gauge aceita zero como progresso válido e movimento reduzido desativa transições', () => {
  const model = {
    kind: 'gauge' as const,
    semantic: 'progress' as const,
    labels: ['Estimativa'],
    series: [{ name: 'Progresso', values: [0] }],
  };
  assert(hasChartData(model));
  assert.deepEqual(availableChartModes(model), ['gauge', 'bar', 'table']);
  assert.equal(chartOptions(model, true, true).animation, false);
  const status = dashboardData('admin', initialTickets(), []).status;
  assert.equal(
    (
      chartOptions(status, false, true).series as {
        universalTransition: boolean;
      }[]
    )[0]!.universalTransition,
    false,
  );
  for (const [system, manual, result] of [
    [false, false, false],
    [false, true, false],
    [true, false, true],
    [true, true, true],
  ] as const)
    assert.equal(motionReduced(system, manual), result);
});

test('projetos de mesmo assunto mantêm identidade distinta no gráfico e nos links', () => {
  const model = {
    kind: 'bar' as const,
    semantic: 'progress' as const,
    labels: ['Projeto demonstrativo', 'Projeto demonstrativo'],
    ids: ['PR-A', 'PR-B'],
    links: ['#/admin/projeto/PR-A', '#/admin/projeto/PR-B'],
    series: [{ name: 'Progresso', values: [10, 90] }],
  };
  const data = (
    chartOptions(model, false, false).series as {
      data: { id: string; value: number }[];
    }[]
  )[0]!.data;
  assert.deepEqual(
    data.map((p) => p.id),
    ['PR-A', 'PR-B'],
  );
  assert.deepEqual(
    data.map((p) => p.value),
    [10, 90],
  );
});
test('login valida campos sem receber/armazenar senhas; erros específicos dependem só do laboratório', () => {
  assert(validateDemoLogin('', false).identifier);
  assert(validateDemoLogin('teste@invalido', true).identifier);
  assert.deepEqual(validateDemoLogin('demo', true), {});
  assert.deepEqual(validateDemoLogin('demo@example.invalid', true), {});
  assert(validateDemoLogin('demo', false).password);
  assert(loginScenarioError('incorrect').includes('simulado'));
  assert(loginScenarioError('not-found').includes('Não foi feita consulta'));
  assert.equal(loginScenarioError('success'), '');
  assert.equal(loginScenarioError('loading'), '');
});
test('cadastro de pessoas valida e-mail único, setor, jornada e não contém senha', () => {
  const people = initialPeople(),
    draft = {
      ...people[2]!,
      id: 'new-demo',
      name: 'Pessoa fictícia',
      email: 'nova@example.invalid',
      mustChangePassword: true,
    };
  assert(
    validatePerson(people, { ...draft, email: ' MARINA@example.invalid ' }),
  );
  assert(validatePerson(people, { ...draft, department: 'Inexistente' }));
  assert(validatePerson(people, { ...draft, schedule: 'Inexistente' }));
  assert.equal(savePerson(people, draft, 'requester'), people);
  const next = savePerson(people, draft, 'admin');
  assert.equal(next.length, people.length + 1);
  assert.equal(next.at(-1)!.mustChangePassword, true);
  assert(!('password' in next.at(-1)!));
  assert.equal(togglePerson(next, draft.id, 'technician'), next);
  const inactive = togglePerson(next, draft.id, 'admin');
  assert.equal(inactive.at(-1)!.active, false);
  assert.equal(next.at(-1)!.active, true);
});
test('progresso exige contexto administrativo, limites e observação; preserva aprovação e histórico', () => {
  const before = initialProjects(),
    project = before[0]!;
  for (const value of [-1, 101, 1.5, NaN])
    assert.equal(
      updateProjectProgress(
        before,
        { id: project.id, value, note: 'Demo' },
        'admin',
      ),
      before,
    );
  assert.equal(
    updateProjectProgress(
      before,
      { id: project.id, value: 90, note: ' ' },
      'admin',
    ),
    before,
  );
  assert.equal(
    updateProjectProgress(
      before,
      { id: project.id, value: 90, note: 'Demo' },
      'technician',
    ),
    before,
  );
  const next = updateProjectProgress(
    before,
    { id: project.id, value: 90, note: 'Avanço fictício' },
    'admin',
  );
  assert.equal(next[0]!.progress, 90);
  assert.equal(next[0]!.stage, project.stage);
  assert.equal(
    next[0]!.progressHistory.length,
    project.progressHistory.length + 1,
  );
  assert.equal(next[0]!.progressHistory.at(-1)!.from, project.progress);
  assert.equal(before[0]!.progress, 0);
  const summary = projectProgressSummary(next);
  assert.equal(
    summary.buckets.reduce((sum, n) => sum + n, 0),
    next.length,
  );
  assert.equal(summary.active + summary.completed, summary.total);
  assert.equal(projectProgressSummary([]).estimate, null);
});
test('encerramento retroativo rejeita futuro, anterior ao início e ausência de justificativa', () => {
  const ticket = initialTickets()[2]!,
    recorded = '2026-10-25T16:00:00Z';
  assert(
    validateEffectiveDate(ticket, '2026-10-26T12:00:00Z', 'Demo', recorded),
  );
  assert(
    validateEffectiveDate(ticket, '2026-10-20T12:00:00Z', 'Demo', recorded),
  );
  assert(validateEffectiveDate(ticket, '2026-10-24T16:00:00Z', '', recorded));
  assert.equal(
    validateEffectiveDate(
      ticket,
      '2026-10-24T16:00:00Z',
      'Concluído ontem, exemplo fictício',
      recorded,
    ),
    '',
  );
  const local = localDateInput('2026-10-24T16:00:00Z');
  assert.equal(localToInstant(local), '2026-10-24T16:00:00.000Z');
});
test('fechar preserva data de registro e conclusão; correção é solicitação sem sobrescrever histórico', () => {
  const before = initialTickets(),
    id = '1046',
    effectiveAt = '2026-10-24T16:00:00Z';
  const invalid = simulate(
    before,
    { type: 'close', id, effectiveAt, justification: '' },
    'technician',
  );
  assert.equal(invalid[2], before[2]);
  const closed = simulate(
    before,
    {
      type: 'close',
      id,
      effectiveAt,
      justification: 'Exemplo fictício de registro posterior',
    },
    'technician',
  );
  assert.equal(closed[2]!.status, 'CLOSED');
  assert.equal(closed[2]!.effectiveCompletedAt, effectiveAt);
  assert.equal(closed[2]!.completionRecordedAt, closed[2]!.closedAt);
  assert.notEqual(closed[2]!.closedAt, effectiveAt);
  const action = {
    type: 'request-completion-correction' as const,
    id,
    effectiveAt: '2026-10-24T17:00:00Z',
    justification: 'Ajuste solicitado, sem aprovação',
  };
  assert.deepEqual(simulate(closed, action, 'admin'), closed);
  const corrected = simulate(closed, action, 'technician');
  assert.equal(corrected[2]!.closedAt, closed[2]!.closedAt);
  assert.equal(corrected[2]!.effectiveCompletedAt, effectiveAt);
  assert.equal(
    corrected[2]!.completionCorrections?.[0]?.stage,
    'REQUESTED_PREVIEW',
  );
  assert.equal(
    corrected[2]!.completionCorrections?.[0]?.originalEffectiveAt,
    effectiveAt,
  );
  assert.deepEqual(closedTimeExamples(corrected), closedTimeExamples(closed));
});
