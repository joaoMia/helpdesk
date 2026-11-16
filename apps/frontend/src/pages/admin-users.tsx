import { useEffect, useRef, useState } from 'react';
import type {
  AdminUser,
  AdminUserInput,
  AdminUserUpdate,
  AdminUserQuery,
  PublicUser,
} from '@helpdesk/contracts';
import { adminUserInputSchema } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { useDebouncedValue } from '../hooks/use-debounced-value';
import { PageHeading, EmptyState, Icon } from '../components/ui';
import { MotionRegion } from '../components/motion-region';
import { TicketPagination } from '../components/ticket-pagination';
import { DemoDialog } from '../components/demo-dialog';
import { OrganizationPicker } from '../components/organization-picker';
import { TemporaryCredentialDialog } from '../components/temporary-credential-dialog';
const roleLabels = {
  ADMIN: 'Administrador',
  TECHNICIAN: 'Técnico',
  REQUESTER: 'Solicitante',
};
type Draft = {
  id?: string;
  name: string;
  email: string;
  username: string;
  role: AdminUser['role'];
  companyId: string | null;
  departmentId: string | null;
  workScheduleId: string | null;
};

export function AdminUserActions({
  isActive,
  onEdit,
  onToggle,
  onResetPassword,
}: {
  isActive: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onResetPassword?: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button className="button-secondary" onClick={onEdit}>
        Visualizar / editar
      </button>
      <button className="text-button" onClick={onToggle}>
        {isActive ? 'Desativar' : 'Ativar'}
      </button>
      {onResetPassword && (
        <button className="text-button" onClick={onResetPassword}>
          Redefinir senha
        </button>
      )}
    </div>
  );
}

export function AdminUsers({
  user,
  onExpired,
}: {
  user: PublicUser;
  onExpired: () => void;
}) {
  const [items, setItems] = useState<AdminUser[]>([]),
    [text, setText] = useState(''),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [role, setRole] = useState<AdminUserQuery['role']>(),
    [status, setStatus] = useState<AdminUserQuery['status']>('all'),
    [companyFilter, setCompanyFilter] = useState<string | null>(null),
    [loaded, setLoaded] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0),
    [draft, setDraft] = useState<Draft | null>(null),
    [action, setAction] = useState<{
      kind: 'activity' | 'password';
      target: AdminUser;
    } | null>(null),
    [credential, setCredential] = useState<{
      email: string;
      password: string;
    } | null>(null),
    [busy, setBusy] = useState(false);
  const search = useDebouncedValue(text.trim()),
    key = JSON.stringify([page, search, role, status, companyFilter, revision]),
    loading = loaded !== key || text.trim() !== search,
    sending = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    authClient
      .adminUsers({
        page,
        pageSize: 10,
        search,
        role,
        status,
        ...(companyFilter ? { companyId: companyFilter } : {}),
      })
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
          else setError('Não foi possível consultar os usuários.');
        }
      })
      .finally(() => {
        if (active) setLoaded(key);
      });
    return () => {
      active = false;
    };
  }, [page, search, role, status, companyFilter, revision, key, onExpired]);
  const initial = items.find((u) => u.id === draft?.id);
  function edit(target?: AdminUser) {
    setError('');
    setNotice('');
    setDraft(
      target
        ? {
            id: target.id,
            name: target.name,
            email: target.email,
            username: target.username ?? '',
            role: target.role,
            companyId: target.companyId,
            departmentId: target.departmentId,
            workScheduleId: target.workScheduleId,
          }
        : {
            name: '',
            email: '',
            username: '',
            role: 'REQUESTER',
            companyId: null,
            departmentId: null,
            workScheduleId: null,
          },
    );
  }
  async function save() {
    if (sending.current || !draft) return;
    // Explicit input projection: no identifiers or privilege flags from the form.
    const data: AdminUserInput = {
      name: draft.name,
      email: draft.email,
      username: draft.username.trim() || null,
      role: draft.role,
      companyId: draft.companyId,
      departmentId: draft.departmentId,
      workScheduleId: draft.workScheduleId,
    };
    const valid = adminUserInputSchema.safeParse(data);
    if (!valid.success) {
      setError(valid.error.issues[0]?.message ?? 'Revise os dados.');
      return;
    }
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      if (draft.id && initial) {
        const patch: AdminUserUpdate = {};
        for (const k of [
          'name',
          'email',
          'username',
          'role',
          'companyId',
          'departmentId',
          'workScheduleId',
        ] as const) {
          const value = valid.data[k] ?? null;
          if (value !== initial[k]) Object.assign(patch, { [k]: value });
        }
        if (!Object.keys(patch).length) {
          setDraft(null);
          return;
        }
        await authClient.updateAdminUser(draft.id, patch);
        if (
          alive.current &&
          draft.id === user.id &&
          Object.keys(patch).some((k) => k !== 'name' && k !== 'username')
        ) {
          onExpired();
          return;
        }
      } else {
        const created = await authClient.createAdminUser(valid.data);
        if (alive.current)
          setCredential({
            email: created.user.email,
            password: created.temporaryPassword,
          });
      }
      if (alive.current) {
        setDraft(null);
        setNotice('Usuário salvo no PostgreSQL.');
        setRevision((n) => n + 1);
      }
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else
          setError(
            e instanceof AuthError
              ? e.message
              : 'Não foi possível confirmar a gravação. Atualize antes de repetir.',
          );
      }
    } finally {
      sending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function confirm() {
    if (sending.current || !action) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      if (action.kind === 'password') {
        const password = await authClient.resetAdminPassword(action.target.id);
        if (alive.current)
          setCredential({ email: action.target.email, password });
      } else {
        await authClient.updateAdminUser(action.target.id, {
          isActive: !action.target.isActive,
        });
        if (action.target.id === user.id) {
          onExpired();
          return;
        }
      }
      if (alive.current) {
        setAction(null);
        setNotice('Operação administrativa confirmada.');
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
        title="Central Administrativa"
        description="Contas reais, vínculos organizacionais e permissões administrativas explícitas."
      >
        <button className="button-primary" onClick={() => edit()}>
          <Icon name="plus" />
          Cadastrar usuário
        </button>
      </PageHeading>
      {error && !draft && !action && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="info-note mb-4">
          {notice}
        </p>
      )}
      <MotionRegion motionKey="admin-real-users">
        <section className="panel">
          <form className="filter-bar" onSubmit={(e) => e.preventDefault()}>
            <label className="search-field">
              <Icon name="search" />
              <span className="sr-only">Buscar usuários</span>
              <input
                maxLength={120}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setPage(1);
                }}
                placeholder="Nome, e-mail ou identificador"
              />
            </label>
            <label>
              <span className="sr-only">Filtrar por perfil</span>
              <select
                className="field"
                value={role ?? ''}
                onChange={(e) => {
                  setRole(
                    (e.target.value as AdminUserQuery['role']) || undefined,
                  );
                  setPage(1);
                }}
              >
                <option value="">Todos os perfis</option>
                {Object.entries(roleLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">Situação da conta</span>
              <select
                className="field"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as typeof status);
                  setPage(1);
                }}
              >
                <option value="all">Todas as situações</option>
                <option value="active">Ativas</option>
                <option value="inactive">Inativas</option>
              </select>
            </label>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setText('');
                setRole(undefined);
                setStatus('all');
                setCompanyFilter(null);
                setPage(1);
              }}
            >
              Limpar filtros
            </button>
          </form>
          <div className="px-5 pb-5 max-w-md">
            <OrganizationPicker
              kind="companies"
              label="Filtrar por empresa"
              value={companyFilter}
              onChange={(id) => {
                setCompanyFilter(id);
                setPage(1);
              }}
              onExpired={onExpired}
            />
          </div>
          {loading && !!items.length && (
            <p role="status" className="px-5 text-sm text-slate-500">
              Atualizando usuários…
            </p>
          )}
          {loading && !items.length ? (
            <p role="status" className="p-6">
              Carregando usuários…
            </p>
          ) : !items.length ? (
            <EmptyState title="Nenhum usuário encontrado">
              Experimente outros filtros.
            </EmptyState>
          ) : (
            <div className="table-scroll">
              <table className="ticket-table">
                <caption className="sr-only">Usuários reais</caption>
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Perfil</th>
                    <th>Empresa / setor</th>
                    <th>Situação</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.name}</strong>
                        <div className="text-xs text-slate-500 break-all">
                          {t.email}
                          <br />
                          {t.username ?? 'Identificador não informado'}
                        </div>
                      </td>
                      <td>{roleLabels[t.role]}</td>
                      <td>
                        {t.companyName ?? 'Não informado'}
                        <div className="text-xs text-slate-500">
                          {t.departmentName ?? 'Não informado'}
                        </div>
                      </td>
                      <td>
                        {t.isActive ? 'Ativo' : 'Inativo'}
                        <div className="text-xs text-slate-500">
                          {t.mustChangePassword
                            ? 'Troca inicial pendente'
                            : 'Troca inicial concluída'}
                        </div>
                      </td>
                      <td>
                        <AdminUserActions
                          isActive={t.isActive}
                          onEdit={() => edit(t)}
                          onToggle={() => {
                            setError('');
                            setAction({ kind: 'activity', target: t });
                          }}
                          onResetPassword={
                            t.id === user.id
                              ? undefined
                              : () => {
                                  setError('');
                                  setAction({ kind: 'password', target: t });
                                }
                          }
                        />
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
          title={draft.id ? 'Dados do usuário' : 'Cadastrar usuário'}
          eyebrow="ADMINISTRAÇÃO REAL"
          description="Somente os campos autorizados serão gravados. Alterações sensíveis revogam as sessões do titular."
          pending={busy}
          confirmLabel={busy ? 'Salvando…' : 'Salvar usuário'}
          onCancel={() => setDraft(null)}
          onConfirm={() => {
            void save();
            return false;
          }}
        >
          <div className="space-y-4">
            <label className="form-label">
              Nome completo
              <input
                className="field"
                required
                minLength={2}
                maxLength={120}
                value={draft.name}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label className="form-label">
              E-mail
              <input
                className="field"
                type="email"
                maxLength={254}
                value={draft.email}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </label>
            <label className="form-label">
              Identificador de usuário
              <input
                className="field"
                maxLength={40}
                value={draft.username}
                disabled={busy}
                onChange={(e) =>
                  setDraft({ ...draft, username: e.target.value })
                }
              />
            </label>
            <label className="form-label">
              Perfil
              <select
                className="field"
                value={draft.role}
                disabled={busy}
                onChange={(e) =>
                  setDraft({ ...draft, role: e.target.value as Draft['role'] })
                }
              >
                {Object.entries(roleLabels).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <OrganizationPicker
              kind="companies"
              label="Empresa"
              value={draft.companyId}
              currentName={initial?.companyName}
              disabled={busy}
              onChange={(id) =>
                setDraft({ ...draft, companyId: id, departmentId: null })
              }
              onExpired={onExpired}
            />
            <OrganizationPicker
              kind="departments"
              label="Setor"
              value={draft.departmentId}
              currentName={initial?.departmentName}
              companyId={draft.companyId}
              disabled={busy}
              onChange={(id) => setDraft({ ...draft, departmentId: id })}
              onExpired={onExpired}
            />
            <OrganizationPicker
              kind="schedules"
              label="Expediente aplicável"
              value={draft.workScheduleId}
              currentName={initial?.workScheduleName}
              disabled={busy}
              onChange={(id) => setDraft({ ...draft, workScheduleId: id })}
              onExpired={onExpired}
            />
            {initial && (
              <p className="text-xs text-slate-500">
                Criado em {new Date(initial.createdAt).toLocaleString('pt-BR')}{' '}
                · Atualizado em{' '}
                {new Date(initial.updatedAt).toLocaleString('pt-BR')}
              </p>
            )}
            {!draft.id && (
              <p className="info-note">
                Será gerada uma credencial provisória individual, com troca
                obrigatória e exibição única.
              </p>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
          </div>
        </DemoDialog>
      )}
      {action && (
        <DemoDialog
          title={
            action.kind === 'password'
              ? 'Redefinir credencial provisória?'
              : action.target.isActive
                ? 'Desativar usuário?'
                : 'Ativar usuário?'
          }
          eyebrow="CONFIRMAÇÃO ADMINISTRATIVA"
          description={`Conta: ${action.target.name}. ${action.kind === 'password' ? 'A senha atual será substituída, sessões revogadas e a troca inicial exigida.' : 'O servidor verificará as proteções de administrador e atendimentos ativos.'}`}
          pending={busy}
          confirmLabel={busy ? 'Processando…' : 'Confirmar operação'}
          onCancel={() => setAction(null)}
          onConfirm={() => {
            void confirm();
            return false;
          }}
        >
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </DemoDialog>
      )}
      {credential && (
        <TemporaryCredentialDialog
          email={credential.email}
          password={credential.password}
          onClose={() => setCredential(null)}
        />
      )}
    </>
  );
}
