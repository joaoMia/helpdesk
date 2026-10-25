import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initialTickets, reasons, services } from '../src/mocks/fixtures';
import { simulate } from '../src/mocks/simulation';

test('abertura local começa OPEN, sem prioridade ou técnico e captura serviços', () => {
  const previous = initialTickets();
  const next = simulate(
    previous,
    {
      type: 'create',
      subject: 'Teste fictício',
      description: 'Descrição de teste',
      services: [services[0]!, services[1]!],
      attachment: 'exemplo.txt',
    },
    'requester',
  );
  assert.equal(next.length, previous.length + 1);
  assert.deepEqual(
    [next[0]!.status, next[0]!.priority, next[0]!.technicianId],
    ['OPEN', null, null],
  );
  assert.equal(next[0]!.services.length, 2);
  assert.notEqual(next[0]!.services[0], services[0]);
  assert.equal(previous.length, 6);
});
test('recusa abertura vazia, serviço inativo e abertura por administrador', () => {
  const before = initialTickets();
  const action = {
    type: 'create' as const,
    subject: 'Teste',
    description: 'Teste',
    services: [services[0]!],
    attachment: null,
  };
  assert.equal(
    simulate(before, { ...action, services: [] }, 'requester'),
    before,
  );
  assert.equal(
    simulate(before, { ...action, subject: ' ' }, 'requester'),
    before,
  );
  assert.equal(
    simulate(before, { ...action, services: [services[5]!] }, 'requester'),
    before,
  );
  assert.equal(simulate(before, action, 'admin'), before);
});
test('classificação e início são passos separados e não alteram a amostra original', () => {
  const before = initialTickets();
  assert.equal(
    simulate(before, { type: 'start', id: '1048' }, 'technician')[0],
    before[0],
  );
  const classified = simulate(
    before,
    { type: 'classify', id: '1048', priority: 'HIGH' },
    'technician',
  );
  assert.deepEqual(
    [
      classified[0]!.status,
      classified[0]!.technicianId,
      classified[0]!.priority,
    ],
    ['OPEN', null, 'HIGH'],
  );
  const started = simulate(
    classified,
    { type: 'start', id: '1048' },
    'technician',
  );
  assert.deepEqual(
    [started[0]!.status, started[0]!.technicianId],
    ['IN_PROGRESS', 't1'],
  );
  assert.equal(before[0]!.priority, null);
});
test('simulação não concede ações técnicas ao administrador ou a outro responsável', () => {
  const before = initialTickets();
  assert.deepEqual(
    simulate(before, { type: 'close', id: '1046' }, 'admin'),
    before,
  );
  assert.deepEqual(
    simulate(before, { type: 'close', id: '1045' }, 'technician'),
    before,
  );
  assert.deepEqual(
    simulate(
      before,
      { type: 'comment', id: '1045', text: 'Teste' },
      'requester',
    ),
    before,
  );
});
test('pendência exige justificativa e mantém snapshot das flags', () => {
  const before = initialTickets();
  const action = {
    type: 'pending' as const,
    id: '1046',
    reason: reasons[1]!,
    explanation: '',
  };
  assert.deepEqual(simulate(before, action, 'technician'), before);
  const next = simulate(
    before,
    { ...action, explanation: 'Fornecedor fictício' },
    'technician',
  );
  assert.equal(next[2]!.status, 'PENDING');
  assert.deepEqual(next[2]!.pending, reasons[1]);
  assert.notEqual(next[2]!.pending, reasons[1]);
  assert.deepEqual(
    simulate(next, { type: 'close', id: '1046' }, 'technician'),
    next,
  );
});
test('resposta do solicitante só retoma com flag permitida', () => {
  const before = initialTickets();
  const resumed = simulate(
    before,
    { type: 'comment', id: '1044', text: 'Informação fictícia' },
    'requester',
  );
  assert.equal(resumed[4]!.status, 'IN_PROGRESS');
  assert.equal(resumed[4]!.pending, null);
  const pending = simulate(
    before,
    { type: 'pending', id: '1046', reason: reasons[1]!, explanation: 'Teste' },
    'technician',
  );
  const unchanged = simulate(
    pending,
    { type: 'comment', id: '1046', text: 'Informação fictícia' },
    'requester',
  );
  assert.equal(unchanged[2]!.status, 'PENDING');
  assert.equal(unchanged[2]!.events.length, pending[2]!.events.length + 1);
});
test('retomada manual permite fechar e encerrado não recebe novas interações', () => {
  const resumed = simulate(
    initialTickets(),
    { type: 'resume', id: '1044' },
    'technician',
  );
  const closed = simulate(resumed, { type: 'close', id: '1044' }, 'technician');
  assert.equal(closed[4]!.status, 'CLOSED');
  assert.deepEqual(
    simulate(
      closed,
      { type: 'comment', id: '1044', text: 'Teste' },
      'requester',
    ),
    closed,
  );
  assert.deepEqual(
    simulate(closed, { type: 'resume', id: '1044' }, 'technician'),
    closed,
  );
});
