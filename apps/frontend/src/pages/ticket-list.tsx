import { statusLabels } from '../lib/presentation';
import { useState } from 'react';
import type { DemoTicket, Role, Status } from '../types/demo';
import { href } from '../navigation/routes';
import { Icon, PageHeading } from '../components/ui';
import { TicketTable } from '../components/ticket-table';

export function TicketList({
  role,
  page,
  tickets,
}: {
  role: Role;
  page: string;
  tickets: DemoTicket[];
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const base = tickets.filter((t) =>
    role === 'requester'
      ? t.requesterId === 'r1'
      : role === 'admin'
        ? true
        : page === 'atendimentos'
          ? t.technicianId === 't1'
          : t.status === 'OPEN' &&
            !t.technicianId &&
            (page === 'nao-classificados' ? !t.priority : !!t.priority),
  );
  const normalize = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const filtered = base.filter(
    (t) =>
      normalize(
        `HD-${t.id} ${t.subject} ${t.services.map((s) => s.name).join(' ')}`,
      ).includes(normalize(query)) &&
      (!status || t.status === status) &&
      (!priority ||
        (priority === 'NONE' ? !t.priority : t.priority === priority)),
  );
  const title =
    page === 'nao-classificados'
      ? 'Não classificados'
      : page === 'classificados'
        ? 'Classificados'
        : page === 'atendimentos'
          ? 'Meus atendimentos'
          : role === 'admin'
            ? 'Todos os chamados'
            : 'Meus chamados';
  return (
    <>
      <PageHeading
        eyebrow="ACOMPANHAMENTO"
        title={title}
        description={
          page === 'classificados'
            ? 'Fila operacional: chamados abertos, com prioridade e ainda sem responsável.'
            : page === 'nao-classificados'
              ? 'Solicitações abertas que aguardam a definição de prioridade. Classificar não significa assumir.'
              : 'Encontre solicitações e acompanhe o andamento dos atendimentos.'
        }
      >
        {role === 'requester' && (
          <a className="button-primary" href={href(role, 'novo')}>
            <Icon name="plus" />
            Abrir chamado
          </a>
        )}
      </PageHeading>
      <section className="panel">
        <div className="filter-bar">
          <label className="search-field">
            <Icon name="search" />
            <span className="sr-only">Buscar chamados</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por número, assunto ou serviço"
            />
          </label>
          <label>
            <span className="sr-only">Filtrar por status</span>
            <select
              className="field"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              {Object.entries(statusLabels).map(([key, label]) => (
                <option key={key} value={key as Status}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar por prioridade</span>
            <select
              className="field"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="">Todas as prioridades</option>
              <option value="NONE">Não classificado</option>
              <option value="LOW">Baixa</option>
              <option value="MEDIUM">Média</option>
              <option value="HIGH">Alta</option>
            </select>
          </label>
          {(query || status || priority) && (
            <button
              className="text-button text-xs"
              onClick={() => {
                setQuery('');
                setStatus('');
                setPriority('');
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
        <TicketTable role={role} tickets={filtered} />
        <div className="table-footer">
          {filtered.length} de {base.length} chamados demonstrativos
          <span>Dados somente nesta sessão</span>
        </div>
      </section>
    </>
  );
}
