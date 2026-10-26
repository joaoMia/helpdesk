import { focusFirstError } from '../lib/motion';
import { useState } from 'react';
import type { DemoPerson } from '../mocks/people';
import { departments, schedules, validatePerson } from '../mocks/people';
import { DemoDialog } from '../components/demo-dialog';
import { PageHeading, EmptyState, Icon } from '../components/ui';
import { useNotifications } from '../hooks/use-notifications';
const roleLabels = {
  requester: 'Solicitante',
  technician: 'Técnico',
  admin: 'Administrador',
};
export function People({
  people,
  technical,
  onSave,
  onToggle,
}: {
  people: DemoPerson[];
  technical: boolean;
  onSave: (draft: DemoPerson) => boolean;
  onToggle: (id: string) => boolean;
}) {
  const [query, setQuery] = useState(''),
    [department, setDepartment] = useState(''),
    [status, setStatus] = useState(''),
    [role, setRole] = useState('');
  const [editing, setEditing] = useState<DemoPerson | null>(null),
    [viewing, setViewing] = useState<DemoPerson | null>(null),
    [toggling, setToggling] = useState<DemoPerson | null>(null),
    [error, setError] = useState('');
  const { notify } = useNotifications();
  const rows = people.filter(
    (p) =>
      (technical ? p.role === 'technician' : p.role !== 'technician') &&
      `${p.name} ${p.email} ${p.department}`
        .toLocaleLowerCase('pt-BR')
        .includes(query.toLocaleLowerCase('pt-BR')) &&
      (!department || p.department === department) &&
      (!status || p.active === (status === 'active')) &&
      (!role || p.role === role),
  );
  const title = technical ? 'Técnicos' : 'Usuários',
    filtered = !!(query || department || status || role);
  function startEdit(draft: DemoPerson) {
    setError('');
    setEditing({ ...draft });
  }
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRAÇÃO · CADASTROS DEMONSTRATIVOS"
        title={title}
        description={
          technical
            ? 'Organize a equipe, a situação das contas e a jornada associada.'
            : 'Explore pessoas, setores e dados de contato fictícios.'
        }
      >
        <button
          className="button-primary"
          onClick={() =>
            startEdit({
              id: 'person_' + crypto.randomUUID(),
              name: '',
              email: '',
              department: technical ? departments[0]! : departments[1]!,
              role: technical ? 'technician' : 'requester',
              active: true,
              schedule: technical ? schedules[0]! : '',
              mustChangePassword: technical,
            })
          }
        >
          <Icon name="plus" />
          {technical ? 'Criar técnico' : 'Criar usuário'}
        </button>
      </PageHeading>
      <p className="info-note mb-6">
        Dados fictícios somente em memória. Nenhuma conta, credencial ou
        permissão real é criada. O seletor de perfis permanece independente
        destes cadastros; permissões definitivas aguardam homologação.
      </p>
      <section className="panel">
        <div className="filter-bar">
          <label className="search-field">
            <Icon name="search" />
            <span className="sr-only">Buscar {title.toLowerCase()}</span>
            <input
              value={query}
              placeholder="Buscar nome, e-mail ou setor"
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Filtrar setor</span>
            <select
              className="field"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            >
              <option value="">Todos os setores</option>
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filtrar situação da conta</span>
            <select
              className="field"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todas as situações</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          </label>
          {!technical && (
            <label>
              <span className="sr-only">Filtrar perfil</span>
              <select
                className="field"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="">Todos os perfis</option>
                <option value="requester">Solicitante</option>
                <option value="admin">Administrador · prévia</option>
              </select>
            </label>
          )}
          {filtered && (
            <button
              className="text-button text-xs"
              onClick={() => {
                setQuery('');
                setDepartment('');
                setStatus('');
                setRole('');
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
        {rows.length ? (
          <div className="table-scroll">
            <p className="px-6 py-3 text-xs text-slate-500 sm:hidden">
              Deslize a tabela para ver todas as colunas →
            </p>
            <table className="directory-table">
              <caption className="sr-only">{title} fictícios</caption>
              <thead>
                <tr>
                  <th>Pessoa</th>
                  <th>Setor</th>
                  <th>
                    {technical
                      ? 'Jornada / primeiro acesso'
                      : 'Perfil demonstrativo'}
                  </th>
                  <th>Situação</th>
                  <th>Ações na sessão</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      <p className="text-xs text-slate-500">{p.email}</p>
                    </td>
                    <td>{p.department}</td>
                    <td>
                      {technical ? (
                        <>
                          {p.schedule}
                          <p className="text-xs text-slate-500">
                            {p.mustChangePassword
                              ? 'Troca de senha no primeiro acesso · prevista'
                              : 'Conta de exemplo existente'}
                          </p>
                        </>
                      ) : (
                        roleLabels[p.role]
                      )}
                    </td>
                    <td>
                      <span
                        className={`badge ${p.active ? 'status-closed' : 'status-open'}`}
                      >
                        {p.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-3">
                        <button
                          className="text-button text-xs"
                          onClick={() => setViewing(p)}
                        >
                          Ver {p.name}
                        </button>
                        <button
                          className="text-button text-xs"
                          onClick={() => startEdit(p)}
                        >
                          Editar {p.name}
                        </button>
                        <button
                          className="text-button text-xs"
                          onClick={() => setToggling(p)}
                        >
                          {p.active ? 'Desativar' : 'Ativar'} {p.name}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nenhuma pessoa nesta seleção">
            Altere a busca ou limpe os filtros.
          </EmptyState>
        )}
        <div className="table-footer">
          {rows.length} registros demonstrativos
          <span>{filtered ? 'Filtros ativos' : 'Amostra da sessão'}</span>
        </div>
      </section>
      {viewing && (
        <DemoDialog
          title={viewing.name}
          onCancel={() => setViewing(null)}
          cancelLabel="Fechar detalhes"
        >
          <dl className="answer-summary">
            <dt>Contato fictício</dt>
            <dd>{viewing.email}</dd>
            <dt>Setor</dt>
            <dd>{viewing.department}</dd>
            <dt>Perfil</dt>
            <dd>{roleLabels[viewing.role]}</dd>
            <dt>Situação</dt>
            <dd>{viewing.active ? 'Ativo' : 'Inativo'}</dd>
            {viewing.role === 'technician' && (
              <>
                <dt>Jornada</dt>
                <dd>{viewing.schedule}</dd>
                <dt>Primeiro acesso</dt>
                <dd>
                  {viewing.mustChangePassword
                    ? 'Troca obrigatória de senha prevista; nenhuma senha gerada'
                    : 'Conta fictícia existente'}
                </dd>
              </>
            )}
          </dl>
        </DemoDialog>
      )}
      {toggling && (
        <DemoDialog
          title={`${toggling.active ? 'Desativar' : 'Ativar'} cadastro?`}
          description={`${toggling.name}: a alteração afeta somente a listagem demonstrativa. Nenhuma conta real será modificada.`}
          onCancel={() => setToggling(null)}
          onConfirm={() => onToggle(toggling.id)}
        />
      )}
      {editing && (
        <DemoDialog
          title={`${people.some((p) => p.id === editing.id) ? 'Editar' : 'Criar'} ${technical ? 'técnico' : 'usuário'}`}
          description="Use dados fictícios. Nenhuma credencial será solicitada ou gerada."
          confirmLabel="Salvar cadastro na sessão"
          onCancel={() => setEditing(null)}
          onConfirm={() => {
            const problem = validatePerson(people, editing);
            if (problem) {
              setError(problem);
              window.requestAnimationFrame(() =>
                focusFirstError(document.querySelector('dialog[open]')),
              );
              notify('error', problem);
              return false;
            }
            return onSave(editing);
          }}
        >
          <label className="form-label">
            Nome completo *
            <input
              className="field"
              maxLength={100}
              required
              aria-invalid={!!error && error.includes('nome')}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label className="form-label">
            E-mail fictício *
            <input
              className="field"
              type="email"
              required
              aria-invalid={!!error && error.includes('e-mail')}
              value={editing.email}
              maxLength={150}
              placeholder="pessoa@example.invalid"
              onChange={(e) =>
                setEditing({ ...editing, email: e.target.value })
              }
            />
          </label>
          <label className="form-label">
            Setor *
            <select
              className="field"
              value={editing.department}
              onChange={(e) =>
                setEditing({ ...editing, department: e.target.value })
              }
            >
              {departments.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </label>
          {!technical && (
            <label className="form-label">
              Perfil demonstrativo
              <select
                className="field"
                value={editing.role}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    role: e.target.value === 'admin' ? 'admin' : 'requester',
                  })
                }
              >
                <option value="requester">Solicitante</option>
                <option value="admin">Administrador · proposta visual</option>
              </select>
            </label>
          )}
          {technical && (
            <>
              <label className="form-label">
                Jornada associada
                <select
                  className="field"
                  value={editing.schedule}
                  onChange={(e) =>
                    setEditing({ ...editing, schedule: e.target.value })
                  }
                >
                  {schedules.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <p className="info-note">
                No módulo real, a criação de técnico usará senha temporária e
                troca obrigatória no primeiro acesso. Esta prévia não gera ou
                armazena senhas nem altera calendários.
              </p>
            </>
          )}
          <label className="option-chip">
            <input
              type="checkbox"
              checked={editing.active}
              onChange={(e) =>
                setEditing({ ...editing, active: e.target.checked })
              }
            />
            Conta ativa na amostra
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </DemoDialog>
      )}
    </>
  );
}
