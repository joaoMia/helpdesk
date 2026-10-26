import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  initialCatalog,
  availableServices,
  validateCatalog,
} from '../src/mocks/catalog';
import { initialTickets } from '../src/mocks/fixtures';
import { simulate } from '../src/mocks/simulation';
import {
  sanitizeAnswers,
  validateAnswers,
  visibleFields,
} from '../src/forms/service-definitions';
import {
  projectFields,
  projectCategories,
} from '../src/forms/project-definitions';
import { initialProjects, requestProject } from '../src/mocks/projects';
import { closedTimeExamples, dashboardData } from '../src/mocks/dashboard-data';
import { chartOptions, hasChartData } from '../src/lib/chart-options';
import type { ServiceField } from '../src/forms/service-definitions';

test('catálogo liga cada serviço a uma categoria e oculta serviços/categorias inativos', () => {
  const catalog = initialCatalog();
  assert.deepEqual(validateCatalog(catalog), []);
  assert.equal(catalog.categories.length, 6);
  assert(
    availableServices(catalog, 'windows').every(
      (s) => s.active && s.categoryId === 'windows',
    ),
  );
  assert(!availableServices(catalog, 'windows').some((s) => s.id === 's6'));
  catalog.categories.find((c) => c.id === 'windows')!.active = false;
  assert.deepEqual(availableServices(catalog, 'windows'), []);
});
test('configuração da sessão chega à abertura; snapshots resistem à edição e desativação', () => {
  const catalog = initialCatalog();
  const category = {
    id: 'demo',
    name: 'Categoria de teste',
    description: 'Fictícia',
    active: true,
    order: 9,
  };
  const service = {
    id: 'demo-service',
    categoryId: category.id,
    name: 'Serviço de teste',
    description: 'Fictício',
    active: true,
    order: 0,
    fields: [
      {
        id: 'unit',
        label: 'Unidade',
        kind: 'select' as const,
        required: true,
        options: ['A', 'B'],
      },
    ],
  };
  catalog.categories.push(category);
  catalog.services.push(service);
  assert.deepEqual(validateCatalog(catalog), []);
  const before = initialTickets();
  const action = {
    type: 'create' as const,
    subject: 'Teste',
    description: 'Teste',
    service,
    category,
    answers: { unit: 'B' },
    attachment: null,
  };
  assert.equal(
    simulate(before, { ...action, answers: { unit: 'X' } }, 'requester'),
    before,
  );
  const created = simulate(before, action, 'requester')[0]!;
  service.name = 'Alterado';
  category.name = 'Alterada';
  service.active = false;
  service.fields[0]!.label = 'Outro rótulo';
  assert.equal(created.service.name, 'Serviço de teste');
  assert.equal(created.category.name, 'Categoria de teste');
  assert.equal(created.service.fields[0]!.label, 'Unidade');
  assert.equal(created.answers.unit, 'B');
  assert(!('services' in created));
  assert.deepEqual(availableServices(catalog, category.id), []);
  assert.equal(simulate(before, action, 'requester'), before);
});
test('editor recusa categorias ausentes, opções repetidas e condições circulares', () => {
  const catalog = initialCatalog();
  catalog.services[0]!.categoryId = 'inexistente';
  catalog.services[0]!.fields = [
    {
      id: 'x',
      label: 'X',
      kind: 'select',
      options: ['A', 'A'],
      when: { field: 'x', includes: 'A' },
    },
  ];
  assert(validateCatalog(catalog).length >= 3);
});
test('condições encadeadas não validam nem retêm respostas de campos ocultos', () => {
  const fields: ServiceField[] = [
    { id: 'enable', label: 'Ativar', kind: 'checkbox' },
    {
      id: 'mode',
      label: 'Modo',
      kind: 'select',
      options: ['A', 'B'],
      required: true,
      when: { field: 'enable', includes: 'yes' },
    },
    {
      id: 'detail',
      label: 'Detalhe',
      kind: 'textarea',
      required: true,
      when: { field: 'mode', includes: 'B' },
    },
  ];
  const answers = { enable: 'no', mode: 'B', detail: 'Valor antigo' };
  assert.deepEqual(
    visibleFields('custom', answers, fields).map((f) => f.id),
    ['enable'],
  );
  assert.deepEqual(sanitizeAnswers('custom', answers, fields), {
    enable: 'no',
  });
  assert.deepEqual(validateAnswers('custom', answers, fields), {});
  assert(
    validateAnswers('custom', { enable: 'yes', mode: 'B' }, fields).detail,
  );
});
test('projetos têm sete categorias, campos próprios e prazo sem aprovação automática', () => {
  assert.equal(projectCategories.length, 7);
  assert(projectFields('bi').some((f) => f.id === 'indicators'));
  assert(!projectFields('bi').some((f) => f.id === 'features'));
  const before = initialProjects();
  const draft = {
    categoryId: 'bi',
    subject: 'BI demonstrativo',
    description: 'Proposta',
    answers: { users: '-1' },
  };
  assert.equal(requestProject(before, draft, 'requester'), before);
  const next = requestProject(
    before,
    { ...draft, answers: { users: '20', indicators: 'Volume por setor' } },
    'requester',
  );
  assert.equal(next.length, before.length + 1);
  assert.equal(next[0]!.categoryId, 'bi');
  assert.equal(next[0]!.stage, 'REQUESTED_PREVIEW');
  assert(!('priority' in next[0]!));
});
test('métricas A/B usam apenas amostras fictícias encerradas, nunca tempos de chamados ativos', () => {
  const tickets = initialTickets();
  assert.deepEqual(
    closedTimeExamples(tickets.filter((t) => t.status !== 'CLOSED')),
    { count: 0, a: null, b: null },
  );
  const sample = tickets.find((t) => t.id === '1041')!;
  assert.deepEqual(closedTimeExamples([sample]), { count: 1, a: 190, b: 80 });
  assert.equal(closedTimeExamples([{ ...sample, status: 'PENDING' }]).count, 0);
  const requester = dashboardData('requester', tickets, initialProjects());
  assert(requester.own.every((t) => t.requesterId === 'r1'));
  const technician = dashboardData('technician', tickets, initialProjects());
  assert(technician.own.every((t) => t.technicianId === 't1'));
  assert(technician.queue.every((t) => t.status === 'OPEN' && !t.technicianId));
});
test('gráficos tratam ausência/valores inválidos, tema e movimento reduzido', () => {
  const empty = { kind: 'bar' as const, labels: [], series: [] };
  assert.equal(hasChartData(empty), false);
  assert.equal(
    hasChartData({
      ...empty,
      labels: ['A'],
      series: [{ name: 'A', values: [NaN] }],
    }),
    false,
  );
  const model = {
    kind: 'line' as const,
    labels: ['A', 'B'],
    series: [{ name: 'Exemplo', values: [1, NaN] }],
  };
  assert.equal(hasChartData(model), true);
  const reduced = chartOptions(model, true, true);
  assert.equal(reduced.animation, false);
  assert.equal(chartOptions(model, false, false).animation, true);
  assert.notDeepEqual(
    chartOptions(model, true, false).textStyle,
    chartOptions(model, false, false).textStyle,
  );
  const series = reduced.series as { data: { value: number }[] }[];
  assert.deepEqual(
    series[0]!.data.map((point) => point.value),
    [1, 0],
  );
});
