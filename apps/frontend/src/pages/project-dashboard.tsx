import { lazy, Suspense, useEffect, useState } from 'react';
import type { PublicUser, ProjectDashboard as Data } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { Panel } from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { AnimatedNumber } from '../components/animated-number';
import { date } from '../lib/presentation';
import type { ChartModel } from '../mocks/dashboard-data';
import { projectLabels, projectArea } from '../lib/project-presentation';
const Chart = lazy(() => import('../components/chart-card'));
export function ProjectDashboard({
  user,
  onExpired,
}: {
  user: PublicUser;
  onExpired: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    authClient
      .projectDashboard()
      .then((v) => {
        if (active) {
          setData(v);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else
            setError('Não foi possível consultar os indicadores de projetos.');
        }
      });
    return () => {
      active = false;
    };
  }, [user.id, onExpired, revision]);
  const models: [string, ChartModel][] = data
    ? [
        [
          'Projetos por status',
          {
            kind: 'pie',
            semantic: 'distribution',
            labels: data.byState.map((v) => projectLabels[v.name]!),
            ids: data.byState.map((v) => v.name),
            series: [
              { name: 'Projetos', values: data.byState.map((v) => v.count) },
            ],
          },
        ],
        [
          'Projetos ao longo dos meses (UTC)',
          {
            kind: 'mixed',
            semantic: 'time',
            labels: data.monthly.map((v) => v.month),
            series: [
              {
                name: 'Solicitações',
                type: 'bar',
                values: data.monthly.map((v) => v.requested),
              },
              {
                name: 'Conclusões',
                type: 'line',
                values: data.monthly.map((v) => v.completed),
              },
              {
                name: 'Cancelamentos',
                type: 'bar',
                values: data.monthly.map((v) => v.canceled),
              },
            ],
          },
        ],
        ...(user.role === 'ADMIN'
          ? [
              [
                'Principais responsáveis (até 10)',
                {
                  kind: 'bar',
                  horizontal: true,
                  semantic: 'distribution',
                  labels: data.byOwner.map((v) => v.name),
                  ids: data.byOwner.map((v) => v.id),
                  series: [
                    {
                      name: 'Projetos',
                      values: data.byOwner.map((v) => v.count),
                    },
                  ],
                },
              ] as [string, ChartModel],
            ]
          : []),
      ]
    : [];
  return (
    <MotionRegion
      motionKey={'projects-dashboard-' + user.id}
      reveal
      className="space-y-5"
    >
      <Panel
        title="Projetos · acompanhamento real"
        action={
          <button
            className="text-button"
            onClick={() => setRevision((v) => v + 1)}
          >
            Atualizar projetos
          </button>
        }
      >
        <div className="form-body space-y-3">
          <a
            className="text-button"
            href={'#/' + projectArea(user) + '/projetos'}
          >
            Consultar projetos →
          </a>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {!data ? (
            <p role="status">Consultando indicadores…</p>
          ) : (
            <>
              <div className="metrics-grid">
                <article className="metric-card" data-animate>
                  <p>Total no meu escopo</p>
                  <p className="metric-value">
                    <AnimatedNumber value={data.total} />
                  </p>
                </article>
                {Object.keys(projectLabels).map((state) => (
                  <article className="metric-card" data-animate key={state}>
                    <p>{projectLabels[state]}</p>
                    <p className="metric-value">
                      <AnimatedNumber
                        value={
                          data.byState.find((s) => s.name === state)?.count ?? 0
                        }
                      />
                    </p>
                  </article>
                ))}
                {user.role === 'ADMIN' && (
                  <article className="metric-card" data-animate>
                    <p>Não terminais sem responsável</p>
                    <p className="metric-value">
                      <AnimatedNumber value={data.unassigned} />
                    </p>
                  </article>
                )}
                {user.role === 'TECHNICIAN' && (
                  <article className="metric-card" data-animate>
                    <p>Atividades pendentes da carteira</p>
                    <p className="metric-value">
                      <AnimatedNumber value={data.pendingActivities} />
                    </p>
                  </article>
                )}
              </div>
              {!data.total && <p>Nenhum projeto autorizado neste escopo.</p>}
              {data.recent.map((p) => (
                <div key={p.id} className="border-b border-slate-200 py-3">
                  <a
                    className="ticket-number"
                    href={'#/' + projectArea(user) + '/projetos/' + p.id}
                  >
                    PR-{p.code} · {p.title}
                  </a>
                  <p className="text-sm text-slate-500">
                    {projectLabels[p.state]} ·{' '}
                    {p.progress
                      ? `${p.progress.percent}% · ${p.progress.done}/${p.progress.total} atividades`
                      : 'Ainda sem plano'}{' '}
                    · {p.owner?.name ?? 'Sem responsável'}
                  </p>
                  {p.plan && (
                    <>
                      <button
                        className="text-button mt-2"
                        aria-expanded={expanded === p.id}
                        onClick={() =>
                          setExpanded((v) => (v === p.id ? null : p.id))
                        }
                      >
                        {expanded === p.id
                          ? 'Recolher plano'
                          : 'Ver etapas e atividades publicadas'}
                      </button>
                      {expanded === p.id && (
                        <div className="mt-3 space-y-3">
                          {p.plan.stages.map((stage) => (
                            <section key={stage.id}>
                              <h3 className="font-semibold">
                                {stage.order}. {stage.title}
                              </h3>
                              <ul className="space-y-1 text-sm">
                                {stage.activities.map((task) => (
                                  <li key={task.id}>
                                    {task.order}. {task.title} ·{' '}
                                    {task.state === 'DONE'
                                      ? 'Concluída'
                                      : task.state === 'IN_PROGRESS'
                                        ? 'Em execução'
                                        : 'A fazer'}
                                  </li>
                                ))}
                              </ul>
                            </section>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </Panel>
      {data && data.total > 0 && (
        <>
          <div className="analytics-grid">
            {models.map(([title, model]) => (
              <Suspense
                key={title}
                fallback={<p role="status">Preparando gráfico…</p>}
              >
                <Chart title={title} model={model} realData stableUpdates />
              </Suspense>
            ))}
          </div>
          <Panel title="Evolução do progresso · últimas 24 mudanças">
            <div className="form-body space-y-2">
              {!data.progressHistory.length && (
                <p>Sem alterações de plano ou atividades.</p>
              )}
              {data.progressHistory.map((p, i) => (
                <p key={p.projectId + ':' + i}>
                  <a
                    className="text-button"
                    href={'#/' + projectArea(user) + '/projetos/' + p.projectId}
                  >
                    PR-{p.code}
                  </a>{' '}
                  · {date(p.createdAt)} ·{' '}
                  {p.percent === null ? 'Ainda sem plano' : p.percent + '%'}
                </p>
              ))}
              <p className="text-xs text-slate-500">
                Cada registro pertence a um projeto. Progresso não equivale a
                SLA ou produtividade.
              </p>
            </div>
          </Panel>
        </>
      )}
    </MotionRegion>
  );
}
