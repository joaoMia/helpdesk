import { useEffect, useRef, useState } from 'react';
import { resetPageScroll } from '../lib/motion';
import { initialCatalog } from '../mocks/catalog';
import {
  initialProjects,
  requestProject,
  updateProjectProgress,
} from '../mocks/projects';
import {
  initialPeople,
  savePerson,
  togglePerson,
  validatePerson,
} from '../mocks/people';
import type { DemoPerson } from '../mocks/people';
import type { ProgressDraft, ProjectDraft } from '../types/project-demo';
import { initialTickets } from '../mocks/fixtures';
import { simulate } from '../mocks/simulation';
import type { DemoAction } from '../types/demo';
import { href, useRoute } from '../navigation/routes';
import { AppShell } from '../layouts/app-shell';
import { MotionRegion } from '../components/motion-region';
import { DemoDialog } from '../components/demo-dialog';
import { useNotifications } from '../hooks/use-notifications';
import { EmptyState } from '../components/ui';
import { Dashboard } from '../pages/dashboard';
import { Projects } from '../pages/projects';
import { People } from '../pages/people';
import { Login } from '../pages/login';
import { ServiceCatalog } from '../pages/service-catalog';
import { TicketList } from '../pages/ticket-list';
import { NewTicket } from '../pages/new-ticket';
import { TicketDetail } from '../pages/ticket-detail';
import { Directory } from '../pages/directory';
const actionMessages: Record<DemoAction['type'], string> = {
  create: 'Chamado aberto na sessão: OPEN, sem prioridade e sem técnico.',
  classify: 'Prioridade classificada. O chamado continua sem responsável.',
  start: 'Atendimento iniciado e atribuído a Lucas na simulação.',
  pending: 'Pendência registrada com motivo e flags preservados na amostra.',
  resume: 'Atendimento retomado na sessão.',
  close:
    'Encerramento registrado na amostra, com as datas preservadas e sem cálculo de métricas.',
  comment:
    'Mensagem adicionada à amostra. A retomada segue a flag do motivo de pendência.',
  'external-totvs':
    'Referência externa TOTVS atualizada na sessão, sem alterar status.',
  'request-completion-correction':
    'Solicitação de correção registrada. Data original preservada; aprovação pendente.',
};
export function App() {
  const { role, page, id } = useRoute();
  const [catalog, setCatalog] = useState(initialCatalog),
    [tickets, setTickets] = useState(initialTickets),
    [projects, setProjects] = useState(initialProjects),
    [people, setPeople] = useState(initialPeople),
    [resetOpen, setResetOpen] = useState(false);
  const { notify } = useNotifications();
  const resetAccepted = useRef(false);
  useEffect(() => {
    document.title =
      page === 'login'
        ? 'HelpDesk · Login demonstrativo'
        : 'HelpDesk · Demonstração';
    document.getElementById('page-title')?.focus({ preventScroll: true });
    resetPageScroll();
  }, [role, page, id]);
  function act(action: DemoAction) {
    const next = simulate(tickets, action, role);
    const changed =
      next.length !== tickets.length ||
      next.some((ticket, index) => ticket !== tickets[index]);
    if (!changed) {
      notify(
        'error',
        'Ação não aplicada. Revise os campos, o perfil e o estado do chamado na amostra.',
      );
      return false;
    }
    setTickets(next);
    notify(
      action.type === 'request-completion-correction' ? 'warning' : 'success',
      actionMessages[action.type] + ' Nada foi salvo no servidor.',
    );
    return true;
  }
  function create(action: Extract<DemoAction, { type: 'create' }>) {
    if (act(action)) window.location.hash = href(role, 'chamados');
  }
  function request(draft: ProjectDraft) {
    const next = requestProject(projects, draft, role);
    if (next === projects) {
      notify(
        'error',
        'Revise os campos da proposta. Nenhum projeto foi criado.',
      );
      return;
    }
    setProjects(next);
    notify(
      'success',
      'Projeto solicitado somente na amostra. Nenhuma aprovação foi executada.',
    );
    window.location.hash = href(role, 'projetos');
  }
  function progress(draft: ProgressDraft) {
    const next = updateProjectProgress(projects, draft, role);
    if (next === projects) {
      notify(
        'error',
        'Progresso não atualizado. Revise percentual, observações e contexto administrativo.',
      );
      return false;
    }
    setProjects(next);
    notify(
      'success',
      'Progresso atualizado em memória, com histórico demonstrativo.',
    );
    return true;
  }
  function person(draft: DemoPerson) {
    const next = savePerson(people, draft, role);
    if (next === people) {
      notify(
        'error',
        validatePerson(people, draft) ||
          'Cadastro não atualizado neste perfil.',
      );
      return false;
    }
    setPeople(next);
    notify(
      'success',
      'Cadastro salvo somente na sessão. Nenhuma conta ou senha real foi criada.',
    );
    return true;
  }
  function toggle(id: string) {
    const next = togglePerson(people, id, role);
    if (next === people) {
      notify('error', 'Não foi possível alterar a situação deste cadastro.');
      return false;
    }
    setPeople(next);
    notify('success', 'Situação do cadastro alterada somente na amostra.');
    return true;
  }
  if (page === 'login') return <Login />;
  return (
    <AppShell
      role={role}
      page={page}
      onReset={() => {
        resetAccepted.current = false;
        setResetOpen(true);
      }}
    >
      {resetOpen && (
        <DemoDialog
          title="Reiniciar a prévia?"
          description="Alterações fictícias de chamados, projetos, catálogo e pessoas serão descartadas nesta sessão. Nenhum dado do servidor será alterado."
          confirmLabel="Reiniciar dados demonstrativos"
          onConfirm={() => {
            resetAccepted.current = true;
          }}
          onCancel={() => {
            setResetOpen(false);
            if (!resetAccepted.current) return;
            setTickets(initialTickets());
            setCatalog(initialCatalog());
            setProjects(initialProjects());
            setPeople(initialPeople());
            notify(
              'info',
              'Amostra reiniciada. Nenhum dado do servidor foi alterado.',
            );
            window.location.hash = href(role, 'painel');
          }}
        />
      )}
      <MotionRegion motionKey={`${role}-${page}-${id}`}>
        {['projetos', 'projeto', 'projeto-novo'].includes(page) ? (
          <Projects
            key={role + '-' + page + '-' + id}
            role={role}
            page={page}
            id={id}
            projects={projects}
            onRequest={request}
            onProgress={progress}
          />
        ) : (page === 'usuarios' || page === 'tecnicos') && role === 'admin' ? (
          <People
            key={page}
            people={people}
            technical={page === 'tecnicos'}
            onSave={person}
            onToggle={toggle}
          />
        ) : page === 'servicos' && role === 'admin' ? (
          <ServiceCatalog
            catalog={catalog}
            onChange={(next) => {
              setCatalog(next);
              notify(
                'success',
                'Catálogo atualizado somente na sessão. Chamados anteriores mantêm seus snapshots.',
              );
            }}
          />
        ) : page === 'painel' ? (
          <Dashboard role={role} tickets={tickets} projects={projects} />
        ) : page === 'novo' && role === 'requester' ? (
          <NewTicket onCreate={create} catalog={catalog} />
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
            key={`${role}-${page}-${id}`}
            tickets={tickets}
            role={role}
            page={page}
            tab={id}
          />
        ) : role === 'admin' && ['jornadas', 'motivos'].includes(page) ? (
          <Directory key={page} page={page} />
        ) : (
          <EmptyState title="Página não encontrada">
            <a className="text-button" href={href(role, 'painel')}>
              Voltar à visão geral
            </a>
          </EmptyState>
        )}
      </MotionRegion>
    </AppShell>
  );
}
