import { statusLabels } from '../lib/presentation';
import type { DemoTicket, Role, Status } from '../types/demo';
import { roles } from '../mocks/fixtures';
import { href } from '../navigation/routes';
import { Icon, Panel, PageHeading } from '../components/ui';
import { TicketTable } from '../components/ticket-table';

export function Dashboard({
  role,
  tickets,
}: {
  role: Role;
  tickets: DemoTicket[];
}) {
  const personal =
    role === 'requester'
      ? tickets.filter((t) => t.requesterId === 'r1')
      : role === 'technician'
        ? tickets.filter((t) => t.technicianId === 't1')
        : tickets;
  const queue = tickets.filter((t) => t.status === 'OPEN' && !t.technicianId);
  const counts = (status: Status) =>
    personal.filter((t) => t.status === status).length;
  const metrics = [
    {
      label: role === 'technician' ? 'Meus atendimentos' : 'Total de chamados',
      value: personal.length,
      icon: 'ticket' as const,
      note: 'Nesta amostra demonstrativa',
      tone: 'violet',
    },
    {
      label: 'Em atendimento',
      value: counts('IN_PROGRESS'),
      icon: 'tool' as const,
      note: 'Com técnico responsável',
      tone: 'blue',
    },
    {
      label: 'Pendentes',
      value: counts('PENDING'),
      icon: 'pause' as const,
      note: 'Aguardando uma próxima etapa',
      tone: 'amber',
    },
    {
      label: 'Encerrados',
      value: counts('CLOSED'),
      icon: 'check' as const,
      note: 'Atendimentos concluídos na amostra',
      tone: 'teal',
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow="SEU ESPAÇO DE SUPORTE"
        title={`Olá, ${roles[role].name.split(' ')[0]}.`}
        description={
          role === 'requester'
            ? 'Acompanhe suas solicitações e conte com a equipe de TI.'
            : role === 'technician'
              ? 'Organize seus atendimentos e acompanhe a fila de triagem.'
              : 'Uma visão da operação para cuidar de pessoas, serviços e atendimento.'
        }
      >
        {role === 'requester' && (
          <a className="button-primary" href={href(role, 'novo')}>
            <Icon name="plus" />
            Abrir chamado
          </a>
        )}
      </PageHeading>
      <section aria-label="Indicadores demonstrativos" className="metrics-grid">
        {metrics.map((metric) => (
          <article className="metric-card" key={metric.label}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">
                {metric.label}
              </p>
              <span className={`metric-icon tone-${metric.tone}`}>
                <Icon name={metric.icon} />
              </span>
            </div>
            <p className="metric-value">
              {metric.value.toString().padStart(2, '0')}
            </p>
            <p className="text-xs leading-5 text-slate-500">{metric.note}</p>
          </article>
        ))}
      </section>
      <div className="dashboard-grid">
        <Panel
          title="Panorama dos chamados"
          subtitle="Distribuição da amostra atual · sem indicadores de tempo útil"
        >
          <div className="status-overview">
            {(['OPEN', 'IN_PROGRESS', 'PENDING', 'CLOSED'] as const).map(
              (status) => (
                <div key={status}>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-slate-600">
                      {statusLabels[status]}
                    </span>
                    <span className="font-semibold text-slate-800">
                      {counts(status)}
                    </span>
                  </div>
                  <div className="progress-track">
                    <div
                      className={`progress-fill fill-${status.toLowerCase()}`}
                      style={{
                        width: `${personal.length ? (counts(status) / personal.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ),
            )}
          </div>
        </Panel>
        <section className="welcome-card">
          <span className="welcome-icon">
            <Icon name={role === 'requester' ? 'plus' : 'ticket'} />
          </span>
          <p className="eyebrow text-teal-200">
            {role === 'requester'
              ? 'PRECISA DE UMA MÃO?'
              : role === 'technician'
                ? 'FILA GERAL DE TRIAGEM'
                : 'UMA BASE BEM ORGANIZADA'}
          </p>
          <h2>
            {role === 'requester'
              ? 'Seu próximo passo começa aqui.'
              : role === 'technician'
                ? `${queue.length} chamados aguardam a equipe.`
                : 'Pessoas e serviços conectados.'}
          </h2>
          <p>
            {role === 'requester'
              ? 'Descreva o que aconteceu e selecione os serviços. Você acompanha cada etapa por aqui.'
              : role === 'technician'
                ? 'Classificar define a prioridade. Assumir é uma ação separada que inicia o atendimento.'
                : 'Explore os cadastros demonstrativos. Ações de supervisão pendentes não estão habilitadas.'}
          </p>
          <a
            href={href(
              role,
              role === 'requester'
                ? 'novo'
                : role === 'technician'
                  ? 'nao-classificados'
                  : 'servicos',
            )}
          >
            {role === 'requester'
              ? 'Criar uma solicitação'
              : role === 'technician'
                ? 'Explorar fila de triagem'
                : 'Explorar serviços'}
            <Icon name="arrow" />
          </a>
        </section>
      </div>
      <Panel
        title={
          role === 'technician'
            ? 'Seus atendimentos recentes'
            : 'Chamados recentes'
        }
        subtitle="Acompanhe a situação de cada solicitação"
        action={
          <a
            className="text-button text-xs"
            href={href(
              role,
              role === 'technician' ? 'atendimentos' : 'chamados',
            )}
          >
            Ver todos <Icon name="arrow" className="size-4" />
          </a>
        }
      >
        <TicketTable role={role} tickets={personal.slice(0, 4)} />
      </Panel>
    </>
  );
}
