import { useEffect, useRef, useState } from 'react';
import type {
  Company,
  Department,
  CompanyInput,
  DepartmentInput,
} from '@helpdesk/contracts';
import { companyInputSchema, departmentInputSchema } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { PageHeading, EmptyState, Icon } from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { TicketPagination } from '../components/ticket-pagination';
import { DemoDialog } from '../components/demo-dialog';
import { OrganizationPicker } from '../components/organization-picker';
type Row = Company | Department;
type Draft = {
  id?: string;
  name: string;
  description: string;
  isActive: boolean;
  companyId: string | null;
  workScheduleId: string | null;
};
export function AdminOrganizations({
  kind,
  onExpired,
}: {
  kind: 'companies' | 'departments';
  onExpired: () => void;
}) {
  const [items, setItems] = useState<Row[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [text, setText] = useState(''),
    [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all'),
    [companyId, setCompanyId] = useState<string | null>(null),
    [loaded, setLoaded] = useState(''),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [draft, setDraft] = useState<Draft | null>(null),
    [activity, setActivity] = useState<Row | null>(null),
    [busy, setBusy] = useState(false);
  const search = useDebouncedValue(text.trim()),
    key = JSON.stringify([kind, page, search, status, companyId, revision]),
    loading = loaded !== key || text.trim() !== search,
    sending = useRef(false),
    alive = useRef(true),
    company = kind === 'companies';
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const q = { page, pageSize: 10, search, status };
    const request = company
      ? authClient.adminCompanies(q)
      : authClient.adminDepartments({
          ...q,
          ...(companyId ? { companyId } : {}),
        });
    request
      .then((r) => {
        if (active) {
          setItems(r.items);
          setTotal(r.total);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          setItems([]);
          setTotal(0);
          if (e instanceof AuthError && e.status === 401) onExpired();
          else setError('Não foi possível consultar os cadastros.');
        }
      })
      .finally(() => {
        if (active) setLoaded(key);
      });
    return () => {
      active = false;
    };
  }, [
    company,
    kind,
    page,
    search,
    status,
    companyId,
    revision,
    key,
    onExpired,
  ]);
  function edit(row?: Row) {
    setError('');
    setDraft({
      ...(row ? { id: row.id } : {}),
      name: row?.name ?? '',
      isActive: row?.isActive ?? true,
      description: row && 'description' in row ? row.description : '',
      companyId: row && 'companyId' in row ? row.companyId : companyId,
      workScheduleId:
        row && 'workScheduleId' in row ? row.workScheduleId : null,
    });
  }
  async function save() {
    if (!draft || sending.current) return;
    const input = company
      ? companyInputSchema.safeParse({
          name: draft.name,
          description: draft.description,
          isActive: draft.isActive,
          workScheduleId: draft.workScheduleId,
        })
      : departmentInputSchema.safeParse({
          name: draft.name,
          isActive: draft.isActive,
          companyId: draft.companyId,
        });
    if (!company && !draft.companyId) {
      setError('Selecione uma empresa antes de cadastrar o setor.');
      return;
    }
    if (!input.success) {
      setError(input.error.issues[0]?.message ?? 'Revise os campos.');
      return;
    }
    const initial = items.find((i) => i.id === draft.id);
    const data =
      draft.id && initial
        ? Object.fromEntries(
            Object.entries(input.data).filter(
              ([k, v]) =>
                v !== (initial as unknown as Record<string, unknown>)[k],
            ),
          )
        : input.data;
    if (draft.id && !Object.keys(data).length) {
      setDraft(null);
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      if (company)
        await authClient.saveCompany(data as Partial<CompanyInput>, draft.id);
      else
        await authClient.saveDepartment(
          data as Partial<DepartmentInput>,
          draft.id,
        );
      if (alive.current) {
        setDraft(null);
        setNotice('Cadastro salvo no PostgreSQL.');
        setRevision((n) => n + 1);
      }
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else
          setError(
            e instanceof AuthError
              ? e.message
              : 'Não foi possível confirmar a gravação.',
          );
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function toggle() {
    if (!activity || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      if (company)
        await authClient.saveCompany(
          { isActive: !activity.isActive },
          activity.id,
        );
      else
        await authClient.saveDepartment(
          { isActive: !activity.isActive },
          activity.id,
        );
      if (alive.current) {
        setActivity(null);
        setNotice(
          'Situação atualizada. Os vínculos e o histórico foram preservados.',
        );
        setRevision((n) => n + 1);
      }
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else
          setError(
            e instanceof AuthError
              ? e.message
              : 'Não foi possível confirmar a operação.',
          );
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRAÇÃO"
        title={company ? 'Empresas' : 'Setores'}
        description="Cadastros reais, sem exclusão de informações históricas."
      >
        <button className="button-primary" onClick={() => edit()}>
          <Icon name="plus" />
          {company ? 'Cadastrar empresa' : 'Cadastrar setor'}
        </button>
      </PageHeading>
      {notice && (
        <p className="info-note mb-4" role="status">
          {notice}
        </p>
      )}
      {error && !draft && !activity && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <MotionRegion motionKey={'real-admin-' + kind}>
        <section className="panel">
          <form className="filter-bar" onSubmit={(e) => e.preventDefault()}>
            <label className="search-field">
              <Icon name="search" />
              <span className="sr-only">
                {company ? 'Buscar empresas' : 'Buscar setores'}
              </span>
              <input
                maxLength={120}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPage(1);
                }}
                placeholder="Pesquisar por nome"
              />
            </label>
            <label>
              <span className="sr-only">Situação do cadastro</span>
              <select
                className="field"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as typeof status);
                  setPage(1);
                }}
              >
                <option value="all">Todas as situações</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
            </label>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setText('');
                setCompanyId(null);
                setStatus('all');
                setPage(1);
              }}
            >
              Limpar filtros
            </button>
          </form>
          {!company && (
            <div className="px-5 pb-5 max-w-md">
              <OrganizationPicker
                kind="companies"
                label="Filtrar por empresa"
                value={companyId}
                onChange={(id) => {
                  setCompanyId(id);
                  setPage(1);
                }}
                onExpired={onExpired}
              />
            </div>
          )}
          {loading ? (
            <p role="status" className="p-6">
              Carregando cadastros…
            </p>
          ) : !items.length ? (
            <EmptyState title="Nenhum cadastro encontrado">
              Cadastre um registro ou ajuste os filtros.
            </EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="ticket-table">
                <caption className="sr-only">
                  {company ? 'Empresas cadastradas' : 'Setores cadastrados'}
                </caption>
                <thead>
                  <tr>
                    <th>Nome</th>
                    {!company && <th>Empresa</th>}
                    <th>Usuários associados</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <strong>{row.name}</strong>
                        {'description' in row && (
                          <p className="text-xs text-slate-500">
                            {row.description}
                          </p>
                        )}
                      </td>
                      {!company && (
                        <td>
                          {'companyName' in row
                            ? row.companyName
                            : 'Não informado'}
                        </td>
                      )}
                      <td>{row.userCount}</td>
                      <td>{row.isActive ? 'Ativo' : 'Inativo'}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="button-secondary"
                            onClick={() => edit(row)}
                          >
                            Editar
                          </button>
                          <button
                            className="text-button"
                            onClick={() => {
                              setError('');
                              setActivity(row);
                            }}
                          >
                            {row.isActive ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <TicketPagination
            page={page}
            total={total}
            busy={loading || busy}
            onPage={setPage}
          />
        </section>
      </MotionRegion>
      {draft && (
        <DemoDialog
          title={
            company
              ? draft.id
                ? 'Editar empresa'
                : 'Cadastrar empresa'
              : draft.id
                ? 'Editar setor'
                : 'Cadastrar setor'
          }
          eyebrow="CADASTRO REAL"
          description="As alterações serão persistidas. Nomes históricos nos chamados permanecem preservados."
          pending={busy}
          confirmLabel={busy ? 'Salvando…' : 'Salvar cadastro'}
          onCancel={() => setDraft(null)}
          onConfirm={() => {
            void save();
            return false;
          }}
        >
          <div className="space-y-4">
            <label className="form-label">
              Nome
              <input
                className="field"
                value={draft.name}
                minLength={2}
                maxLength={120}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            {company ? (
              <>
                <label className="form-label">
                  Descrição administrativa
                  <textarea
                    className="field"
                    maxLength={1000}
                    value={draft.description}
                    disabled={busy}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                </label>
                <OrganizationPicker
                  kind="schedules"
                  label="Expediente padrão da empresa"
                  value={draft.workScheduleId}
                  disabled={busy}
                  onChange={(id) => setDraft({ ...draft, workScheduleId: id })}
                  onExpired={onExpired}
                />
              </>
            ) : (
              <OrganizationPicker
                kind="companies"
                label="Empresa"
                value={draft.companyId}
                currentName={
                  items.find((i) => i.id === draft.id) &&
                  'companyName' in items.find((i) => i.id === draft.id)!
                    ? (items.find((i) => i.id === draft.id) as Department)
                        .companyName
                    : null
                }
                disabled={busy}
                onChange={(id) => setDraft({ ...draft, companyId: id })}
                onExpired={onExpired}
              />
            )}
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={draft.isActive}
                disabled={busy}
                onChange={(e) =>
                  setDraft({ ...draft, isActive: e.target.checked })
                }
              />
              Cadastro ativo
            </label>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </DemoDialog>
      )}
      {activity && (
        <DemoDialog
          title={activity.isActive ? 'Desativar cadastro?' : 'Ativar cadastro?'}
          eyebrow="CONFIRMAÇÃO"
          description={`${activity.name}. A operação não exclui usuários nem modifica chamados históricos.`}
          pending={busy}
          confirmLabel={busy ? 'Processando…' : 'Confirmar alteração'}
          onCancel={() => setActivity(null)}
          onConfirm={() => {
            void toggle();
            return false;
          }}
        >
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
