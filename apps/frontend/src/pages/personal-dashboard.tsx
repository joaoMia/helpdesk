import { ProjectDashboard } from './project-dashboard';
import { lazy, Suspense, useEffect, useState } from 'react';
import type { PersonalDashboard, PublicUser } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { PageHeading, StatusBadge, PriorityBadge } from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { AnimatedNumber } from '../components/animated-number';
import { date } from '../lib/presentation';
import { statusLabels } from '../lib/presentation';
const statusName = (name: string) =>
  name === 'RESOLVED'
    ? 'Resolvido'
    : (statusLabels[name as keyof typeof statusLabels] ?? name);
import type { ChartModel } from '../mocks/dashboard-data';

const ChartCard = lazy(() => import('../components/chart-card'));
export function PersonalDashboardPage({
  user,
  onExpired,
}: {
  user: PublicUser;
  onExpired: () => void;
}) {
  const [data, setData] = useState<PersonalDashboard | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const technician = user.role === 'TECHNICIAN';
  const prefix = technician ? 'technician' : 'requester';
  useEffect(() => {
    let active = true;
    authClient
      .personalDashboard()
      .then((value) => {
        if (active) {
          setData(value);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else
            setError('Não foi possível atualizar seu início. Tente novamente.');
        }
      });
    return () => {
      active = false;
    };
  }, [user.id, onExpired, revision]);
  const count = (status: string) =>
    data?.byStatus.find((row) => row.name === status)?.count ?? 0;
  const charts: [string, ChartModel][] = data
    ? [
        [
          'Meus chamados por status',
          {
            kind: 'pie',
            semantic: 'distribution',
            labels: data.byStatus.map((r) => statusName(r.name)),
            ids: data.byStatus.map((r) => r.name),
            series: [
              { name: 'Chamados', values: data.byStatus.map((r) => r.count) },
            ],
          },
        ],
        [
          'Meus chamados por prioridade',
          {
            kind: 'bar',
            semantic: 'distribution',
            horizontal: true,
            labels: data.byPriority.map(
              (r) =>
                ({
                  LOW: 'Baixa',
                  MEDIUM: 'Média',
                  HIGH: 'Alta',
                  NONE: 'Não classificado',
                })[r.name] ?? r.name,
            ),
            ids: data.byPriority.map((r) => r.name),
            series: [
              { name: 'Chamados', values: data.byPriority.map((r) => r.count) },
            ],
          },
        ],
      ]
    : [];
  return (
    <>
      <PageHeading
        eyebrow={technician ? 'MEU TRABALHO' : 'MEU ACOMPANHAMENTO'}
        title={`Olá, ${user.name}`}
        description={
          technician
            ? 'Sua fila individual e a disponibilidade de triagem em tempo real de consulta.'
            : 'Uma visão dos seus chamados e das últimas atualizações.'
        }
      />
      <div className="flex flex-wrap gap-3">
        <a
          className="button-primary"
          href={
            technician
              ? '#/technician/chamados/nao-classificados'
              : '#/requester/novo'
          }
        >
          {technician ? 'Abrir filas de triagem' : 'Abrir chamado'}
        </a>
        <a
          className="button-secondary"
          href={
            technician ? '#/technician/atendimentos' : '#/requester/chamados'
          }
        >
          {technician ? 'Meus atendimentos' : 'Meus chamados'}
        </a>
        <button
          className="text-button"
          onClick={() => setRevision((n) => n + 1)}
        >
          Atualizar indicadores
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {!data ? (
        <p role="status">Consultando seus indicadores…</p>
      ) : (
        <MotionRegion
          motionKey={'personal-dashboard-' + user.id}
          reveal
          className="space-y-6"
        >
          <section
            className="metrics-grid dashboard-metrics"
            aria-label="Indicadores próprios"
          >
            {[
              [
                technician ? 'Atribuídos a mim' : 'Total dos meus chamados',
                data.total,
              ],
              ['Abertos', count('OPEN')],
              ['Em atendimento', count('IN_PROGRESS')],
              ['Pendentes', count('PENDING')],
              ['Resolvidos', count('RESOLVED')],
              ...(technician
                ? [['Disponíveis para triagem', data.triageAvailable]]
                : []),
            ].map(([label, value]) => (
              <article className="metric-card" data-animate key={label}>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="metric-value">
                  <AnimatedNumber value={Number(value)} />
                </p>
              </article>
            ))}
          </section>
          <div className="analytics-grid">
            {charts.map(([title, model]) => (
              <Suspense
                key={title}
                fallback={<p role="status">Preparando gráfico…</p>}
              >
                <ChartCard title={title} model={model} stableUpdates realData />
              </Suspense>
            ))}
          </div>
          <section className="panel form-body space-y-3" data-animate>
            <h2 className="font-semibold">SLA das minhas soluções</h2>
            <p>
              Atenção aos {count('PENDING')} chamados pendentes da sua carteira.
              Consulte prioridades e detalhes em{' '}
              <a
                className="text-button"
                href={
                  technician
                    ? '#/technician/atendimentos'
                    : '#/requester/chamados'
                }
              >
                Meus chamados
              </a>
              .
            </p>
            <p>
              {data.sla.met} dentro da meta · {data.sla.exceeded} fora da meta ·{' '}
              {data.sla.unknown} sem cobertura histórica suficiente
            </p>
            <p className="text-xs text-slate-500">
              Somente revisões finalizadas por solução. O SLA usa o calendário
              útil e não equivale às métricas finais de encerramento.
            </p>
          </section>
          <section className="panel" data-animate>
            <h2 className="px-6 pt-5 font-semibold">Atendimentos recentes</h2>
            {!data.recent.length ? (
              <p className="p-6 text-slate-500">Nenhum chamado neste escopo.</p>
            ) : (
              <div className="table-scroll">
                <table className="ticket-table">
                  <thead>
                    <tr>
                      <th>Chamado</th>
                      <th>Status</th>
                      <th>Prioridade</th>
                      <th>Última alteração</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <a
                            className="ticket-number"
                            href={`#/${prefix}/chamado/${t.id}`}
                          >
                            HD-{t.code} · {t.subject}
                          </a>
                        </td>
                        <td>
                          <StatusBadge status={t.status as 'OPEN'} />
                        </td>
                        <td>
                          <PriorityBadge
                            priority={t.priority as 'LOW' | null}
                          />
                        </td>
                        <td>{date(t.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className="panel form-body space-y-3" data-animate>
            <h2 className="font-semibold">Atualizações dos meus chamados</h2>
            {!data.updates.length && (
              <p className="text-slate-500">Sem atualizações.</p>
            )}
            {data.updates.map((e) => (
              <p key={e.id}>
                <a
                  className="text-button"
                  href={`#/${prefix}/chamado/${e.ticketId}`}
                >
                  HD-{e.code}
                </a>{' '}
                · {date(e.createdAt)} · Atualização registrada
              </p>
            ))}
          </section>
        </MotionRegion>
      )}
      {<ProjectDashboard user={user} onExpired={onExpired} />}
    </>
  );
}
