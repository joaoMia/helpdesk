import type { PublicUser } from '@helpdesk/contracts';
import { ProjectDashboard } from './project-dashboard';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { Dashboard, DashboardQuery } from '@helpdesk/contracts';
import { dashboardQuerySchema } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { PageHeading, Icon } from '../components/ui';
import { AnimatedNumber } from '../components/animated-number';
import { MotionRegion } from '../components/motion-region';
import { OrganizationPicker } from '../components/organization-picker';
import { loadAllOptions } from '../lib/paginated-options';
import type { ChartModel } from '../mocks/dashboard-data';
import { priorityLabels, statusLabels } from '../lib/presentation';
const ChartCard = lazy(() => import('../components/chart-card'));
function TechnicianFilter({
  value,
  onChange,
  onExpired,
}: {
  value: string;
  onChange: (id: string) => void;
  onExpired: () => void;
}) {
  const [items, setItems] = useState<{ id: string; name: string }[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    loadAllOptions((page) =>
      authClient.adminUsers({
        role: 'TECHNICIAN',
        status: 'all',
        page,
        pageSize: 50,
      }),
    )
      .then((rows) => {
        if (active) {
          setItems(rows);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          setItems([]);
          if (e instanceof AuthError && e.status === 401) onExpired();
          else setError('Não foi possível carregar os técnicos.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onExpired]);
  return (
    <label className="form-label">
      Técnico
      <select
        className="field w-full"
        aria-label="Filtrar técnico"
        disabled={loading || !!error}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {loading ? 'Carregando técnicos…' : 'Todos os técnicos'}
        </option>
        {value && !items.some((i) => i.id === value) && (
          <option value={value}>Técnico selecionado</option>
        )}
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="form-error">
          {error}
        </span>
      )}
    </label>
  );
}
const statusName = (name: string) =>
  name === 'RESOLVED'
    ? 'Resolvido'
    : (statusLabels[name as keyof typeof statusLabels] ?? name);
export function AdminDashboard({
  user,
  onExpired,
}: {
  user?: PublicUser;
  onExpired: () => void;
}) {
  const initial = () => ({
    from: new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  });
  const [query, setQuery] = useState<DashboardQuery>(initial),
    [data, setData] = useState<Dashboard | null>(null),
    [loaded, setLoaded] = useState(''),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const key = JSON.stringify([query, revision]),
    valid = dashboardQuerySchema.safeParse(query).success,
    loading = valid && loaded !== key;
  useEffect(() => {
    let active = true;
    const parsed = dashboardQuerySchema.safeParse(query);
    if (!parsed.success) return;
    authClient
      .dashboard(parsed.data)
      .then((r) => {
        if (active) {
          setData(r);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else setError('Não foi possível consultar os indicadores reais.');
        }
      })
      .finally(() => {
        if (active) setLoaded(key);
      });
    return () => {
      active = false;
    };
  }, [query, key, onExpired]);
  function filter(name: keyof DashboardQuery, value: string) {
    setQuery((q) => {
      const n = { ...q };
      if (value) (n as Record<string, string>)[name] = value;
      else delete n[name];
      return n;
    });
  }
  function distribution(
    rows: { id?: string; name: string; count: number }[],
    label: (s: string) => string = (s) => s,
  ): ChartModel {
    return {
      kind: 'bar',
      semantic: 'distribution',
      labels: rows.map((r) => label(r.name)),
      ids: rows.map((r) => r.id ?? r.name),
      series: [{ name: 'Chamados', values: rows.map((r) => r.count) }],
      horizontal: true,
    };
  }
  const stats = data
    ? ([
        ['Total de chamados', data.total],
        [
          'Resolvidos (status atual)',
          data.byStatus.find((r) => r.name === 'RESOLVED')?.count ?? 0,
        ],
        [
          'Encerrados',
          data.byStatus.find((r) => r.name === 'CLOSED')?.count ?? 0,
        ],
        ['Soluções dentro do SLA', data.slaMet],
        ['Soluções fora do SLA', data.slaExceeded],
      ] as const)
    : [];
  const plots = data
    ? ([
        [
          'Evolução de solicitações',
          {
            kind: 'mixed',
            semantic: 'time',
            labels: data.monthly.map((m) => m.month),
            series: [
              {
                name: 'Abertos',
                type: 'bar',
                values: data.monthly.map((m) => m.opened),
              },
              {
                name: 'Soluções registradas',
                type: 'line',
                values: data.monthly.map((m) => m.resolved),
              },
              {
                name: 'Encerrados',
                type: 'bar',
                values: data.monthly.map((m) => m.closed),
              },
            ],
          } as ChartModel,
        ],
        [
          'Distribuição por status',
          {
            ...distribution(data.byStatus, statusName),
            kind: 'rose',
            horizontal: false,
          } as ChartModel,
        ],
        [
          'Distribuição por prioridade',
          distribution(
            data.byPriority,
            (n) =>
              priorityLabels[n as keyof typeof priorityLabels] ??
              'Não classificado',
          ),
        ],
        [
          'Chamados por empresa',
          {
            ...distribution(data.byCompany),
            kind: 'pie',
            horizontal: false,
          } as ChartModel,
        ],
        [
          'Cumprimento do SLA medido',
          {
            kind: 'gauge',
            semantic: 'progress',
            unit: '%',
            labels:
              data.slaMet + data.slaExceeded > 0
                ? ['Soluções com medição válida']
                : [],
            series: [
              {
                name: 'Dentro da meta',
                values:
                  data.slaMet + data.slaExceeded > 0
                    ? [
                        Math.round(
                          (data.slaMet * 1000) /
                            (data.slaMet + data.slaExceeded),
                        ) / 10,
                      ]
                    : [],
              },
            ],
          } as ChartModel,
        ],
        ['Chamados por setor', distribution(data.byDepartment)],
        ['Chamados por técnico', distribution(data.byTechnician)],
      ] as const)
    : [];
  return (
    <>
      <PageHeading
        eyebrow="VISÃO ADMINISTRATIVA REAL"
        title="Dashboard"
        description="Indicadores calculados no PostgreSQL com filtros de organização e histórico."
      />
      <section
        className="panel p-4 space-y-3"
        aria-label="Filtros do dashboard"
      >
        <div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <label className="form-label">
            De (UTC)
            <input
              className="field w-full"
              type="date"
              value={query.from ?? ''}
              onChange={(e) => filter('from', e.target.value)}
            />
          </label>
          <label className="form-label">
            Até (UTC)
            <input
              className="field w-full"
              type="date"
              value={query.to ?? ''}
              onChange={(e) => filter('to', e.target.value)}
            />
          </label>
          <label className="form-label">
            Status
            <select
              className="field w-full"
              value={query.status ?? ''}
              onChange={(e) => filter('status', e.target.value)}
            >
              <option value="">Todos</option>
              {[...Object.entries(statusLabels), ['RESOLVED', 'Resolvido']].map(
                ([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ),
              )}
            </select>
          </label>
          <OrganizationPicker
            includeInactive
            kind="companies"
            label="Empresa"
            value={query.companyId ?? null}
            onChange={(v) =>
              setQuery((q) => ({
                ...q,
                companyId: v ?? undefined,
                departmentId: undefined,
              }))
            }
            onExpired={onExpired}
          />
          <OrganizationPicker
            includeInactive
            kind="departments"
            label="Setor"
            companyId={query.companyId}
            value={query.departmentId ?? null}
            onChange={(v) => filter('departmentId', v ?? '')}
            onExpired={onExpired}
          />
          <TechnicianFilter
            value={query.technicianId ?? ''}
            onChange={(v) => filter('technicianId', v)}
            onExpired={onExpired}
          />
          <label className="form-label">
            Prioridade
            <select
              className="field w-full"
              value={query.priority ?? ''}
              onChange={(e) => filter('priority', e.target.value)}
            >
              <option value="">Todas</option>
              {Object.entries(priorityLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          <button
            className="button-secondary"
            onClick={() => setQuery(initial())}
          >
            Limpar filtros
          </button>
          <button
            className="text-button"
            onClick={() => setRevision((n) => n + 1)}
          >
            Atualizar indicadores
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Cartões e distribuições consideram chamados abertos no intervalo. Na
          evolução, a solução usa a data efetiva e o encerramento usa sua data
          de conclusão. O SLA mede o tempo até a solução. As médias A/B abaixo
          consideram apenas chamados encerrados com métricas finais.
        </p>
      </section>
      {!dashboardQuerySchema.safeParse(query).success && (
        <p role="alert" className="form-error">
          Informe um período válido de até dez anos.
        </p>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {loading && !data ? (
        <p role="status" className="panel p-6">
          Consultando indicadores…
        </p>
      ) : (
        valid &&
        data && (
          <MotionRegion motionKey="real-admin-dashboard" className="space-y-6">
            <section
              className="metrics-grid dashboard-metrics"
              aria-label="Indicadores reais"
            >
              {stats.map(([label, value], i) => (
                <article className="metric-card" data-animate key={label}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-500">
                      {label}
                    </p>
                    <span
                      className={`metric-icon ${['tone-teal', 'tone-blue', 'tone-violet', 'tone-amber', 'tone-teal'][i]}`}
                    >
                      <Icon name="ticket" />
                    </span>
                  </div>
                  <p className="metric-value">
                    <AnimatedNumber value={value} />
                  </p>
                  <p className="text-xs text-slate-500">Dados persistidos</p>
                </article>
              ))}
            </section>
            <div className="analytics-grid">
              {plots.map(([title, model]) => (
                <Suspense
                  key={title}
                  fallback={
                    <section className="panel p-6" role="status">
                      Preparando gráfico…
                    </section>
                  }
                >
                  <ChartCard
                    title={title}
                    model={model}
                    realData
                    stableUpdates
                    subtitle="Dados reais do PostgreSQL"
                  />
                </Suspense>
              ))}
            </div>
            <section className="panel form-body space-y-3">
              <h2 className="font-semibold">Tempos úteis até o encerramento</h2>
              <p>
                A média (da abertura ao encerramento):{' '}
                {data.averageASeconds === null
                  ? 'Sem amostra'
                  : (data.averageASeconds / 3600).toFixed(2) + ' h úteis'}
              </p>
              <p>
                B média (do primeiro início ao encerramento):{' '}
                {data.averageBSeconds === null
                  ? 'Sem amostra'
                  : (data.averageBSeconds / 3600).toFixed(2) + ' h úteis'}
              </p>
              <p className="text-xs text-slate-500">
                {data.finalMetricsCount} chamados encerrados com métricas finais
                · {data.slaUnknown} soluções sem avaliação histórica completa de
                SLA. Tempos em andamento não entram nas médias.
              </p>
            </section>
          </MotionRegion>
        )
      )}
      {user && <ProjectDashboard user={user} onExpired={onExpired} />}
    </>
  );
}
