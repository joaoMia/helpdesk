import { useEffect, useState } from 'react';
import type { DemoAction } from '../types/demo';
import { initialTickets } from '../mocks/fixtures';
import { simulate } from '../mocks/simulation';
import { href, useRoute } from '../navigation/routes';
import { AppShell } from '../layouts/app-shell';
import { Dashboard } from '../pages/dashboard';
import { TicketList } from '../pages/ticket-list';
import { NewTicket } from '../pages/new-ticket';
import { TicketDetail } from '../pages/ticket-detail';
import { Directory } from '../pages/directory';
import { EmptyState, Icon } from '../components/ui';

export function App() {
  const { role, page, id } = useRoute();
  const [tickets, setTickets] = useState(initialTickets);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    document.title = 'HelpDesk · Demonstração';
    document.getElementById('page-title')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [role, page, id]);
  function act(action: DemoAction) {
    setTickets((current) => simulate(current, action, role));
    setNotice(
      'Simulação aplicada apenas na memória desta página. Nada foi salvo no servidor.',
    );
  }
  function create(action: Extract<DemoAction, { type: 'create' }>) {
    act(action);
    window.location.hash = href(role, 'chamados');
  }
  return (
    <AppShell
      role={role}
      page={page}
      onReset={() => {
        if (
          !window.confirm(
            'Reiniciar os dados fictícios? As alterações desta prévia serão descartadas.',
          )
        )
          return;
        setTickets(initialTickets());
        setNotice('Amostra reiniciada. Nenhum dado do servidor foi alterado.');
        window.location.hash = href(role, 'painel');
      }}
    >
      {notice && (
        <div className="feedback" role="status">
          <Icon name="check" />
          <p>{notice}</p>
          <button
            className="icon-button ml-auto"
            aria-label="Dispensar mensagem"
            onClick={() => setNotice('')}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {page === 'painel' ? (
        <Dashboard role={role} tickets={tickets} />
      ) : page === 'novo' && role === 'requester' ? (
        <NewTicket onCreate={create} />
      ) : page === 'chamado' ? (
        <TicketDetail
          key={`${role}-${id}`}
          ticket={tickets.find((t) => t.id === id)}
          role={role}
          onAction={act}
        />
      ) : [
          'chamados',
          'nao-classificados',
          'classificados',
          'atendimentos',
        ].includes(page) ? (
        <TicketList
          key={`${role}-${page}`}
          tickets={tickets}
          role={role}
          page={page}
        />
      ) : role === 'admin' &&
        ['usuarios', 'tecnicos', 'servicos', 'jornadas', 'motivos'].includes(
          page,
        ) ? (
        <Directory key={page} page={page} />
      ) : (
        <EmptyState title="Página não encontrada">
          <a className="text-button" href={href(role, 'painel')}>
            Voltar à visão geral
          </a>
        </EmptyState>
      )}
    </AppShell>
  );
}
