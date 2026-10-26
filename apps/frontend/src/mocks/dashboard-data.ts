import type { DemoTicket, Role } from '../types/demo';
import type { DemoProject } from '../types/project-demo';
import { statusLabels, priorityLabels } from '../lib/presentation';
import { technicianName } from './fixtures';
export type ChartMode =
  'line' | 'bar' | 'pie' | 'rose' | 'mixed' | 'gauge' | 'table';
export interface ChartModel {
  kind: Exclude<ChartMode, 'table'>;
  semantic?: 'time' | 'distribution' | 'progress' | 'duration';
  unit?: string;
  links?: string[];
  colors?: string[];
  labels: string[];
  ids?: string[];
  series: { name: string; values: number[]; type?: 'line' | 'bar' }[];
  horizontal?: boolean;
}
// Amostras FIXAS fictícias de minutos úteis, sem derivação de timestamps ou motor de calendário.
const timeExamples: Record<string, { a: number; b: number }> =
  Object.fromEntries([
    ['1041', { a: 190, b: 80 }],
    ...Array.from({ length: 12 }, (_, i) => [
      String(1000 + i),
      { a: 120 + i * 20, b: 50 + i * 10 },
    ]),
  ]);
export function closedTimeExamples(tickets: DemoTicket[]) {
  const samples = tickets
    .filter((t) => t.status === 'CLOSED' && timeExamples[t.id])
    .map((t) => timeExamples[t.id]!);
  return {
    count: samples.length,
    a: samples.length
      ? Math.round(samples.reduce((v, s) => v + s.a, 0) / samples.length)
      : null,
    b: samples.length
      ? Math.round(samples.reduce((v, s) => v + s.b, 0) / samples.length)
      : null,
  };
}
export function durationLabel(value: number | null) {
  return value === null
    ? 'Sem amostra'
    : `${Math.floor(value / 60)}h ${String(value % 60).padStart(2, '0')}min`;
}
function grouped(values: string[]): {
  labels: string[];
  series: { name: string; values: number[] }[];
} {
  const counts = new Map<string, number>();
  values.forEach((v) => counts.set(v, (counts.get(v) ?? 0) + 1));
  return {
    labels: [...counts.keys()],
    series: [{ name: 'Chamados', values: [...counts.values()] }],
  };
}
export function dashboardData(
  role: Role,
  tickets: DemoTicket[],
  projects: DemoProject[],
  periodMonths = 7,
) {
  const scoped = tickets.filter((t) =>
    role === 'requester'
      ? t.requesterId === 'r1'
      : role === 'technician'
        ? t.technicianId === 't1'
        : true,
  );
  const ownProjects = projects.filter(
    (p) => role !== 'requester' || p.requesterId === 'r1',
  );
  const queue = tickets.filter((t) => t.status === 'OPEN' && !t.technicianId);
  const statuses = ['OPEN', 'IN_PROGRESS', 'PENDING', 'CLOSED'] as const;
  const end = new Date(
    Math.max(
      ...tickets.map((t) => Date.parse(t.createdAt)),
      Date.parse('2026-10-01T00:00:00Z'),
    ),
  );
  const from = new Date(
    Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - periodMonths + 1, 1),
  ).toISOString();
  const own = scoped.filter((t) => Date.parse(t.createdAt) >= Date.parse(from));
  const closedInPeriod = scoped.filter(
    (t) =>
      t.status === 'CLOSED' &&
      t.closedAt &&
      Date.parse(t.closedAt) >= Date.parse(from),
  );
  const months = Array.from(
    { length: periodMonths },
    (_, i) =>
      new Date(
        Date.UTC(
          end.getUTCFullYear(),
          end.getUTCMonth() - periodMonths + 1 + i,
          1,
        ),
      ),
  );
  const monthValues = (key: 'createdAt' | 'closedAt') =>
    months.map(
      (month) =>
        scoped.filter(
          (t) =>
            (key !== 'closedAt' || t.status === 'CLOSED') &&
            t[key]?.slice(0, 7) === month.toISOString().slice(0, 7),
        ).length,
    );
  const labels = months.map((d) =>
    new Intl.DateTimeFormat('pt-BR', {
      month: 'short',
      timeZone: 'UTC',
    }).format(d),
  );
  const priorityKeys = ['LOW', 'MEDIUM', 'HIGH'] as const;
  const status: ChartModel = {
    kind: 'rose',
    semantic: 'distribution',
    colors: ['#94a8ba', '#6494f5', '#edb750', '#22b8a0'],
    labels: statuses.map((s) => statusLabels[s]),
    series: [
      {
        name: 'Chamados',
        values: statuses.map((s) => own.filter((t) => t.status === s).length),
      },
    ],
  };
  const priority: ChartModel = {
    kind: 'bar',
    semantic: 'distribution',
    colors: ['#94a8ba', '#edb750', '#e58a85', '#aa8be8'],
    labels: [...priorityKeys.map((p) => priorityLabels[p]), 'Não classificado'],
    series: [
      {
        name: 'Chamados',
        values: [
          ...priorityKeys.map(
            (p) => own.filter((t) => t.priority === p).length,
          ),
          own.filter((t) => !t.priority).length,
        ],
      },
    ],
  };
  const openings = monthValues('createdAt'),
    closings = monthValues('closedAt');
  const trend = openings.map((_, i) => {
    const window = openings.slice(Math.max(0, i - 2), i + 1);
    return (
      Math.round((window.reduce((sum, v) => sum + v, 0) / window.length) * 10) /
      10
    );
  });
  const evolution: ChartModel = {
    kind: 'mixed',
    semantic: 'time',
    labels,
    series: [
      { name: 'Abertos no período', values: openings, type: 'bar' },
      { name: 'Encerrados no período', values: closings, type: 'bar' },
      {
        name: 'Tendência · média móvel',
        values: trend,
        type: 'line',
      },
    ],
  };
  return {
    own,
    closedInPeriod,
    period: { from, to: end.toISOString().slice(0, 7), months: periodMonths },
    ownProjects,
    queue,
    status,
    priority,
    evolution,
    time: closedTimeExamples(closedInPeriod),
    categories: {
      kind: 'bar' as const,
      horizontal: true,
      ...grouped(own.map((t) => t.category.name)),
    },
    services: {
      kind: 'bar' as const,
      horizontal: true,
      ...grouped(own.map((t) => t.service.name)),
    },
    technicians: {
      kind: 'bar' as const,
      ...grouped(
        own
          .filter((t) => t.status === 'CLOSED' && t.closedBy)
          .map((t) => technicianName(t.closedBy ?? null)),
      ),
    },
    pending: {
      kind: 'bar' as const,
      horizontal: true,
      ...grouped(
        own
          .filter((t) => t.status === 'PENDING' && t.pending)
          .map((t) => t.pending!.name),
      ),
    },
  };
}
