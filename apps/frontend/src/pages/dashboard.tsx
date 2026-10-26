import { scrollToContent } from '../lib/motion';
import { AnimatedNumber } from '../components/animated-number';
import { projectProgressSummary } from '../mocks/projects';
import type { ReactNode } from 'react';
import { lazy, Suspense, useMemo, useState } from 'react';
import type { DemoTicket, Role } from '../types/demo';
import type { DemoProject } from '../types/project-demo';
import { roles } from '../mocks/fixtures';
import { dashboardData, durationLabel } from '../mocks/dashboard-data';
import type { ChartModel } from '../mocks/dashboard-data';
import { href } from '../navigation/routes';
import { Icon, PageHeading, Panel } from '../components/ui';
import { TicketTable } from '../components/ticket-table';
import { MotionRegion } from '../components/motion-region';
import { projectCategoryName } from '../forms/project-definitions';
const ChartCard = lazy(() => import('../components/chart-card'));
function Plot({
  title,
  model,
  subtitle,
  action,
}: {
  title: string;
  model: ChartModel;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <Suspense
      fallback={
        <div className="panel p-6" aria-busy="true">
          <h2>{title}</h2>
          <div className="chart-placeholder">Preparando visualização…</div>
        </div>
      }
    >
      <ChartCard
        title={title}
        model={model}
        subtitle={subtitle}
        action={action}
      />
    </Suspense>
  );
}
export function Dashboard({
  role,
  tickets,
  projects,
}: {
  role: Role;
  tickets: DemoTicket[];
  projects: DemoProject[];
}) {
  const [periodMonths, setPeriodMonths] = useState(7);
  const progressSummary = projectProgressSummary(projects);
  const data = useMemo(
    () => dashboardData(role, tickets, projects, periodMonths),
    [role, tickets, projects, periodMonths],
  );
  const [serviceView, setServiceView] = useState('category');
  const count = (status: DemoTicket['status']) =>
    data.own.filter((t) => t.status === status).length;
  const metrics =
    role === 'technician'
      ? [
          [
            'Aguardando classificação',
            data.queue.filter((t) => !t.priority).length,
            'Fila geral',
          ],
          [
            'Classificados livres',
            data.queue.filter((t) => t.priority).length,
            'Ainda não assumidos',
          ],
          [
            'Meus atendimentos ativos',
            count('IN_PROGRESS') + count('PENDING'),
            'Responsabilidade de Lucas',
          ],
          ['Meus pendentes', count('PENDING'), 'Aguardando próxima etapa'],
          [
            'Encerrados por mim',
            data.closedInPeriod.filter((t) => t.closedBy === 't1').length,
            'Na amostra histórica',
          ],
        ]
      : [
          ['Total de chamados', data.own.length, 'Na amostra demonstrativa'],
          ['Abertos', count('OPEN'), 'Ainda não iniciados'],
          ['Em atendimento', count('IN_PROGRESS'), 'Com técnico responsável'],
          ['Pendentes', count('PENDING'), 'Por motivo configurado'],
          [
            'Encerrados no período',
            data.closedInPeriod.length,
            'Por data do registro de encerramento',
          ],
        ];
  return (
    <MotionRegion motionKey={'dashboard-' + role}>
      <PageHeading
        eyebrow="CENTRAL DE ATENDIMENTO · VISÃO DEMONSTRATIVA"
        title={`Olá, ${roles[role].name.split(' ')[0]}.`}
        description={
          role === 'requester'
            ? 'Seu suporte, do primeiro pedido à solução. Acompanhe chamados e projetos em um só lugar.'
            : role === 'technician'
              ? 'Priorize a fila e acompanhe seus atendimentos. Os indicadores pessoais ficam separados da triagem.'
              : 'Uma visão clara da operação: volume, distribuição e projetos para apoiar a avaliação da interface.'
        }
      >
        {role === 'requester' ? (
          <a className="button-primary" href={href(role, 'novo')}>
            <Icon name="plus" />
            Abrir chamado
          </a>
        ) : (
          <a
            className="button-secondary"
            href={href(
              role,
              role === 'technician' ? 'chamados/todos' : 'chamados',
            )}
          >
            Explorar chamados <Icon name="arrow" />
          </a>
        )}
      </PageHeading>
      <nav className="dashboard-sections" aria-label="Seções do dashboard">
        <button
          onClick={() =>
            scrollToContent(document.getElementById('dashboard-tickets'))
          }
        >
          Chamados
        </button>
        {role !== 'requester' && (
          <button
            onClick={() =>
              scrollToContent(document.getElementById('dashboard-times'))
            }
          >
            Tempos dos encerrados
          </button>
        )}
        {role === 'admin' && (
          <button
            onClick={() =>
              scrollToContent(document.getElementById('dashboard-projects'))
            }
          >
            Andamento dos projetos
          </button>
        )}
      </nav>
      <div className="dashboard-context" id="dashboard-tickets">
        <span>
          <span className="live-dot" />
          Dados fictícios da sessão
        </span>
        <span>Contagens da amostra · sem SLA ou metas de produção</span>
      </div>
      <div className="dashboard-filter filter-bar">
        <label className="form-label">
          Período dos indicadores
          <select
            className="field"
            value={periodMonths}
            onChange={(e) => setPeriodMonths(Number(e.target.value))}
          >
            <option value={3}>Últimos 3 meses da amostra</option>
            <option value={6}>Últimos 6 meses da amostra</option>
            <option value={7}>Toda a amostra (7 meses)</option>
            <option value={12}>Últimos 12 meses da amostra</option>
          </select>
        </label>
        <p className="text-xs leading-6 text-slate-500">
          Status e distribuições: chamados abertos no intervalo, no estado
          atual. Encerramentos: data de registro no intervalo. Fila operacional
          e projetos mostram a sessão atual. Meses UTC nesta demonstração.
        </p>
        {periodMonths !== 7 && (
          <button
            className="text-button text-xs"
            onClick={() => setPeriodMonths(7)}
          >
            Limpar período
          </button>
        )}
      </div>
      <section
        className="metrics-grid dashboard-metrics"
        aria-label="Indicadores demonstrativos"
      >
        {metrics.map(([label, value, note], i) => (
          <article className="metric-card" data-animate key={label}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-500">{label}</p>
              <span
                className={`metric-icon ${['tone-teal', 'tone-blue', 'tone-violet', 'tone-amber', 'tone-teal'][i]}`}
              >
                <Icon name={i === 4 ? 'check' : i === 3 ? 'pause' : 'ticket'} />
              </span>
            </div>
            <p className="metric-value">
              <AnimatedNumber value={Number(value)} />
            </p>
            <p className="text-xs text-slate-500">{note}</p>
          </article>
        ))}
      </section>
      <div className="analytics-grid">
        <Plot
          title={
            role === 'technician'
              ? 'Atendimentos ao longo do período'
              : 'Evolução de solicitações'
          }
          model={data.evolution}
          subtitle="Barras: aberturas e encerramentos. Linha: média móvel de aberturas, sem previsão futura."
        />
        <Plot
          title="Distribuição por status"
          model={data.status}
          subtitle="Quatro estados oficiais · a mesma amostra em Rose, rosca, barras ou tabela"
        />
      </div>
      {role !== 'requester' && (
        <section
          className="time-examples"
          id="dashboard-times"
          aria-label="Exemplos fictícios de tempo útil"
        >
          <div>
            <p className="eyebrow">TEMPOS ÚTEIS · EXEMPLOS FIXOS FICTÍCIOS</p>
            <h2>Somente chamados encerrados</h2>
            <p>
              Valores ilustrativos de {data.time.count} encerrados com amostra.
              Não calculados por jornada, pausas ou pendências nesta interface.
            </p>
          </div>
          <article>
            <span>Métrica A · abertura → encerramento</span>
            <strong>{durationLabel(data.time.a)}</strong>
          </article>
          <article>
            <span>Métrica B · primeiro início → encerramento</span>
            <strong>{durationLabel(data.time.b)}</strong>
          </article>
        </section>
      )}
      {role !== 'requester' && (
        <div
          className={
            role === 'admin'
              ? 'analytics-grid times-chart-row'
              : 'analytics-grid'
          }
        >
          <Plot
            title="Tempos médios ilustrativos dos encerrados"
            subtitle="Amostras fixas fictícias em minutos úteis. Sem cálculo de jornada ou SLA; não são duração corrida."
            model={{
              kind: 'bar',
              semantic: 'duration',
              horizontal: true,
              unit: 'min',
              labels: data.time.count
                ? [
                    'A · abertura → encerramento',
                    'B · primeiro início → encerramento',
                  ]
                : [],
              series: [
                {
                  name: 'Média fictícia',
                  values: [data.time.a ?? 0, data.time.b ?? 0],
                },
              ],
            }}
          />
          {role === 'technician' && (
            <Plot
              title="Prioridade dos meus atendimentos"
              model={data.priority}
            />
          )}
        </div>
      )}
      {role === 'admin' && (
        <div className="analytics-grid">
          <Plot title="Distribuição por prioridade" model={data.priority} />
          <Plot
            title={
              serviceView === 'category'
                ? 'Chamados por categoria'
                : 'Chamados por serviço'
            }
            model={serviceView === 'category' ? data.categories : data.services}
            action={
              <label className="text-xs">
                <span className="sr-only">Distribuir por</span>
                <select
                  className="profile-select"
                  value={serviceView}
                  onChange={(e) => setServiceView(e.target.value)}
                >
                  <option value="category">Categoria</option>
                  <option value="service">Serviço</option>
                </select>
              </label>
            }
          />
          <Plot
            title="Encerramentos por técnico"
            model={data.technicians}
            subtitle="Somente chamados encerrados, pelo ator do fechamento"
          />
          <Plot title="Pendências por motivo" model={data.pending} />
        </div>
      )}
      {role === 'admin' && (
        <section
          aria-label="Andamento dos Projetos"
          className="project-dashboard"
          id="dashboard-projects"
        >
          <header className="section-heading">
            <p className="eyebrow">CARTEIRA DEMONSTRATIVA</p>
            <h2>Andamento dos Projetos</h2>
            <p>
              Percentuais manuais. Conclusão por percentual não significa
              aprovação nem compromisso de prazo.
            </p>
          </header>
          <div className="project-overview">
            <article>
              <span>Total de projetos</span>
              <strong>
                <AnimatedNumber value={progressSummary.total} />
              </strong>
            </article>
            <article>
              <span>Ativos na amostra (menos de 100%)</span>
              <strong>
                <AnimatedNumber value={progressSummary.active} />
              </strong>
            </article>
            <article>
              <span>Percentual concluído (100%)</span>
              <strong>
                <AnimatedNumber value={progressSummary.completed} />
              </strong>
            </article>
          </div>
          <div className="analytics-grid">
            <Plot
              title="Estimativa agregada de progresso"
              subtitle="Média simples, sem ponderação por porte ou marcos. Método definitivo pendente."
              model={{
                kind: 'gauge',
                semantic: 'progress',
                unit: '%',
                labels:
                  progressSummary.estimate === null
                    ? []
                    : ['Estimativa demonstrativa'],
                series: [
                  {
                    name: 'Progresso',
                    values: [progressSummary.estimate ?? 0],
                  },
                ],
              }}
            />
            <Plot
              title="Progresso por projeto"
              subtitle="Clique em uma barra ou no nome da tabela para abrir o projeto."
              model={{
                kind: 'bar',
                semantic: 'progress',
                unit: '%',
                horizontal: true,
                labels: projects.map((p) => p.subject),
                ids: projects.map((p) => p.id),
                links: projects.map((p) => href(role, 'projeto/' + p.id)),
                series: [
                  {
                    name: 'Progresso manual',
                    values: projects.map((p) => p.progress),
                  },
                ],
              }}
            />
            <Plot
              title="Projetos por faixa de conclusão"
              model={{
                kind: 'bar',
                horizontal: true,
                labels: [
                  'Não iniciado · 0%',
                  '1–24%',
                  '25–49%',
                  '50–74%',
                  '75–99%',
                  'Completo · 100%',
                ],
                series: [{ name: 'Projetos', values: progressSummary.buckets }],
              }}
            />
          </div>
        </section>
      )}
      <div className="dashboard-bottom">
        <Panel
          title={
            role === 'technician'
              ? 'Meus atendimentos recentes'
              : 'Últimos chamados'
          }
          subtitle="Registros fictícios e seus snapshots"
          action={
            <a
              className="text-button text-xs"
              href={href(
                role,
                role === 'technician' ? 'atendimentos' : 'chamados',
              )}
            >
              Ver todos <Icon name="arrow" />
            </a>
          }
        >
          <TicketTable role={role} tickets={data.own.slice(0, 4)} />
        </Panel>
        <Panel
          title={role === 'requester' ? 'Meus projetos' : 'Visão dos projetos'}
          subtitle="Categorias e estados provisórios"
          action={
            <a className="text-button text-xs" href={href(role, 'projetos')}>
              Explorar
            </a>
          }
        >
          <div className="form-body">
            <div className="project-count">
              <strong>
                {data.ownProjects.length.toString().padStart(2, '0')}
              </strong>
              <span>propostas demonstrativas</span>
            </div>
            {data.ownProjects.slice(0, 3).map((p) => (
              <a
                className="project-mini"
                key={p.id}
                href={href(role, 'projeto/' + p.id)}
              >
                <span className="ticket-number">{p.id}</span>
                <strong>{p.subject}</strong>
                <span>{projectCategoryName(p.categoryId)}</span>
              </a>
            ))}
            {!data.ownProjects.length && (
              <p className="text-sm text-slate-500">
                Nenhum projeto nesta amostra.
              </p>
            )}
            {role === 'requester' && (
              <a
                className="button-secondary w-full justify-center"
                href={href(role, 'projeto-novo')}
              >
                Solicitar projeto <Icon name="plus" />
              </a>
            )}
          </div>
        </Panel>
      </div>
    </MotionRegion>
  );
}
