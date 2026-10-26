import { initialCatalog } from '../src/mocks/catalog';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  sanitizeAnswers,
  validateAnswers,
  visibleFields,
} from '../src/forms/service-definitions';
import { resolveTheme } from '../src/lib/theme';
import {
  initialProjects,
  projectScope,
  requestProject,
} from '../src/mocks/projects';
import { initialTickets, services } from '../src/mocks/fixtures';
import { ticketScope } from '../src/mocks/ticket-visibility';
import { simulate } from '../src/mocks/simulation';

test('Spark usa dados gerais; TOTVS e Portal ativam somente seus campos', () => {
  const spark = {
    systems: ['Spark'],
    fullName: 'Pessoa Exemplo',
    department: 'Demo',
  };
  assert.deepEqual(validateAnswers('s1', spark), {});
  assert(
    !visibleFields('s1', spark).some(
      (f) => f.id === 'modules' || f.id === 're',
    ),
  );
  assert(
    validateAnswers('s1', { ...spark, systems: ['TOTVS', 'Portal Permetal'] })
      .modules,
  );
  assert(
    validateAnswers('s1', { ...spark, systems: ['TOTVS', 'Portal Permetal'] })
      .re,
  );
  const complete = {
    ...spark,
    systems: ['TOTVS', 'Portal Permetal'],
    modules: 'Estoque',
    accessHours: '08h–18h',
    re: 'DEMO',
    email: 'pessoa@example.invalid',
    manager: 'Gestor Exemplo',
  };
  assert.deepEqual(validateAnswers('s1', complete), {});
  const sanitized = sanitizeAnswers('s1', { ...complete, systems: ['Spark'] });
  assert(!('modules' in sanitized));
  assert(!('re' in sanitized));
});
test('valida URL, e-mail, sistemas e anexo sem solicitar senha', () => {
  assert(
    validateAnswers('s2', {
      website: 'javascript:alert(1)',
      windowsUser: 'demo',
    }).website,
  );
  assert(
    validateAnswers('s2', {
      website: 'https://user:pass@example.invalid',
      windowsUser: 'demo',
    }).website,
  );
  assert.deepEqual(
    validateAnswers('s2', {
      website: 'https://example.invalid',
      windowsUser: 'demo',
    }),
    {},
  );
  assert(
    validateAnswers('s3', { module: 'Estoque', problem: 'Falha' }).evidence,
  );
  assert.deepEqual(
    validateAnswers('s3', {
      module: 'Estoque',
      problem: 'Falha',
      evidence: 'arquivo-demo.txt',
    }),
    {},
  );
  assert(
    validateAnswers('s1', {
      systems: ['Outro'],
      fullName: 'Demo',
      department: 'Demo',
    }).systems,
  );
  assert(
    validateAnswers('s1', {
      systems: ['Portal Permetal'],
      fullName: 'Demo',
      department: 'Demo',
      re: '0',
      manager: 'Demo',
      email: 'invalido',
    }).email,
  );
});
test('abertura mantém respostas do serviço escolhido e rejeita campos condicionais incompletos', () => {
  const before = initialTickets();
  const action = {
    type: 'create' as const,
    subject: 'Demo',
    description: 'Demo',
    service: services[0]!,
    category: initialCatalog().categories.find((c) => c.id === 'accounts')!,
    attachment: null,
    answers: { systems: ['Spark'], fullName: 'Demo', department: 'Demo' },
  };
  const next = simulate(before, action, 'requester');
  assert.equal(next.length, before.length + 1);
  assert.equal(next[0]!.technicianId, null);
  assert.equal(next[0]!.priority, null);
  assert.equal(next[0]!.answers.fullName, 'Demo');
  assert.equal(
    simulate(before, { ...action, answers: {} }, 'requester'),
    before,
  );
});
test('referência externa não altera estado e só técnico responsável pode simular edição', () => {
  const before = initialTickets();
  const action = {
    type: 'external-totvs' as const,
    id: '1046',
    value: 'TOTVS-DEMO-1',
  };
  assert.deepEqual(simulate(before, action, 'requester'), before);
  assert.deepEqual(simulate(before, action, 'admin'), before);
  const next = simulate(before, action, 'technician');
  assert.equal(next[2]!.externalTotvs, 'TOTVS-DEMO-1');
  assert.equal(next[2]!.status, before[2]!.status);
  assert.equal(next[2]!.pending, before[2]!.pending);
  assert.equal(before[2]!.externalTotvs, undefined);
});
test('abas técnicas preservam os escopos conservadores e os quatro estados', () => {
  const tickets = initialTickets();
  assert(
    ticketScope(tickets, 'technician', 'chamados', 'nao-classificados').every(
      (t) => t.status === 'OPEN' && !t.priority && !t.technicianId,
    ),
  );
  assert(
    ticketScope(tickets, 'technician', 'chamados', 'classificados').every(
      (t) => t.status === 'OPEN' && t.priority && !t.technicianId,
    ),
  );
  const all = ticketScope(tickets, 'technician', 'chamados', 'todos');
  assert.equal(new Set(all.map((t) => t.status)).size, 4);
  assert(!all.some((t) => t.technicianId === 't2'));
});
test('projetos ficam separados, validam campos e não alteram chamados', () => {
  const projects = initialProjects();
  const tickets = initialTickets();
  const snapshot = JSON.stringify(tickets);
  assert.equal(
    requestProject(
      projects,
      { categoryId: 'software', subject: ' ', description: 'Demo' },
      'requester',
    ),
    projects,
  );
  assert.equal(
    requestProject(
      projects,
      { categoryId: 'software', subject: 'Demo', description: 'Demo' },
      'admin',
    ),
    projects,
  );
  const next = requestProject(
    projects,
    {
      categoryId: 'software',
      subject: 'Projeto fictício',
      description: 'Exemplo',
    },
    'requester',
  );
  assert.equal(next.length, projects.length + 1);
  assert(next[0]!.id.startsWith('PR-'));
  assert(!('priority' in next[0]!));
  assert(projectScope(next, 'requester').every((p) => p.requesterId === 'r1'));
  assert.equal(JSON.stringify(tickets), snapshot);
});
test('tema inicial usa sistema sem escolha e preserva preferência válida', () => {
  assert.equal(resolveTheme(null, true), 'dark');
  assert.equal(resolveTheme(null, false), 'light');
  assert.equal(resolveTheme('invalido', true), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
  for (const [stored, dark, throws] of [
    [null, true, false],
    ['light', true, false],
    ['dark', false, false],
    [null, false, true],
  ] as const) {
    const document = {
      documentElement: { dataset: {} as Record<string, string> },
    };
    runInNewContext(script, {
      document,
      localStorage: {
        getItem: () => {
          if (throws) throw Error();
          return stored;
        },
      },
      matchMedia: () => ({ matches: dark }),
    });
    assert.equal(
      document.documentElement.dataset.theme,
      resolveTheme(stored, dark),
    );
  }
});
