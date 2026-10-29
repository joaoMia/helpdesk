import { useEffect, useRef, useState } from 'react';
import type { Technician } from '@helpdesk/contracts';
import { createTechnicianSchema } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
export function Technicians({ onExpired }: { onExpired: () => void }) {
  const [items, setItems] = useState<Technician[]>([]),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [refresh, setRefresh] = useState(0),
    [editing, setEditing] = useState<Technician | null>(null),
    [form, setForm] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [created, setCreated] = useState<{
      email: string;
      password: string;
    } | null>(null);
  const alive = useRef(true),
    dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    authClient
      .technicians({ page, pageSize: 10, search: filter })
      .then((result) => {
        if (active) {
          setItems(result.items);
          setTotal(result.total);
          setError('');
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else
            setError('Não foi possível carregar os técnicos. Tente novamente.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, filter, refresh, onExpired]);
  useEffect(() => {
    if (created) dialog.current?.showModal();
  }, [created]);
  function start(technician: Technician | null) {
    setEditing(technician);
    setName(technician?.name ?? '');
    setEmail(technician?.email ?? '');
    setForm(true);
    setError('');
    setNotice('');
  }
  async function details(id: string) {
    setBusy(true);
    try {
      const item = await authClient.technician(id);
      if (alive.current) start(item);
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) onExpired();
      else setError('Não foi possível consultar o técnico.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    const input = createTechnicianSchema.safeParse({ name, email });
    if (!input.success) {
      setError('Informe nome completo e e-mail válido.');
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await authClient.updateTechnician(editing.id, input.data);
        if (alive.current)
          setNotice(
            'Técnico atualizado. Alterações de e-mail encerram as sessões da conta.',
          );
      } else {
        const result = await authClient.createTechnician(input.data);
        if (alive.current)
          setCreated({
            email: result.technician.email,
            password: result.temporaryPassword,
          });
      }
      if (alive.current) {
        setForm(false);
        setName('');
        setEmail('');
        setEditing(null);
        setRefresh((n) => n + 1);
        setLoading(true);
      }
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof AuthError && e.status === 401) onExpired();
      else
        setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  function closeSecret() {
    dialog.current?.close();
    setCreated(null);
    setNotice(
      'Cadastro concluído. A senha provisória não pode ser consultada novamente.',
    );
  }
  async function copySecret() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.password);
      setNotice(
        'Senha copiada. Entregue por canal seguro e separado; limpe a área de transferência após o uso.',
      );
    } catch {
      setNotice(
        'Cópia indisponível neste navegador. Consulte a senha nesta confirmação antes de fechar.',
      );
    }
  }
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Gestão de usuários</h1>
          <p className="text-sm text-slate-500">
            Técnicos reais · somente administradores
          </p>
        </div>
        <button
          className="button-primary"
          disabled={busy || !!created}
          onClick={() => start(null)}
        >
          Cadastrar técnico
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <form
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setFilter(search.trim());
          setLoading(true);
          setRefresh((n) => n + 1);
        }}
      >
        <label className="flex-1 min-w-0">
          <span className="sr-only">Buscar técnicos por nome ou e-mail</span>
          <input
            className="field w-full"
            type="search"
            maxLength={120}
            placeholder="Buscar por nome ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="button-secondary">Buscar</button>
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setSearch('');
            setFilter('');
            setPage(1);
            setRefresh((n) => n + 1);
            setLoading(true);
          }}
        >
          Limpar
        </button>
      </form>
      {form && (
        <form
          onSubmit={(e) => void save(e)}
          className="panel p-5 space-y-4 max-w-xl"
        >
          <h2 className="font-semibold">
            {editing ? 'Dados do técnico' : 'Novo técnico'}
          </h2>
          {editing && (
            <p className="text-sm">
              Situação: {editing.isActive ? 'Ativo' : 'Inativo'} · Troca inicial{' '}
              {editing.mustChangePassword ? 'pendente' : 'concluída'}
              <br />
              Criado em {new Date(editing.createdAt).toLocaleString('pt-BR')} ·
              Atualizado em{' '}
              {new Date(editing.updatedAt).toLocaleString('pt-BR')}
            </p>
          )}
          <label className="block">
            Nome completo
            <input
              className="field w-full mt-2"
              required
              minLength={2}
              maxLength={120}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block">
            E-mail
            <input
              className="field w-full mt-2"
              required
              type="email"
              maxLength={254}
              value={email}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          {!editing && (
            <p className="info-note">
              Será gerada uma senha provisória individual, exibida uma única vez
              após o cadastro. O técnico deverá substituí-la no primeiro acesso.
            </p>
          )}
          <div className="flex gap-3">
            <button className="button-primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              className="button-secondary"
              type="button"
              disabled={busy}
              onClick={() => setForm(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <div className="panel overflow-x-auto">
        {loading ? (
          <p className="p-5" role="status">
            Carregando técnicos…
          </p>
        ) : !items.length ? (
          <p className="p-5">Nenhum técnico encontrado.</p>
        ) : (
          <table className="w-full text-sm">
            <caption className="sr-only">Técnicos cadastrados</caption>
            <thead>
              <tr>
                {['Nome', 'E-mail', 'Situação', 'Troca inicial', 'Ações'].map(
                  (h) => (
                    <th className="p-4 text-left" key={h}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id}>
                  <td className="p-4">{t.name}</td>
                  <td className="p-4 break-all">{t.email}</td>
                  <td className="p-4">{t.isActive ? 'Ativo' : 'Inativo'}</td>
                  <td className="p-4">
                    {t.mustChangePassword ? 'Pendente' : 'Concluída'}
                  </td>
                  <td className="p-4">
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => void details(t.id)}
                    >
                      Visualizar / editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <button
          className="button-secondary"
          disabled={page === 1 || loading}
          onClick={() => {
            setPage((p) => p - 1);
            setLoading(true);
          }}
        >
          Anterior
        </button>
        <span>
          Página {page} · {total} técnico(s)
        </span>
        <button
          className="button-secondary"
          disabled={page * 10 >= total || loading}
          onClick={() => {
            setPage((p) => p + 1);
            setLoading(true);
          }}
        >
          Próxima
        </button>
      </div>
      <dialog
        ref={dialog}
        aria-labelledby="credential-title"
        onCancel={(e) => {
          e.preventDefault();
          closeSecret();
        }}
        onClose={() => setCreated(null)}
        className="panel p-6 max-w-lg w-[calc(100%-2rem)]"
      >
        {created && (
          <div className="space-y-4">
            <h2 id="credential-title" className="text-lg font-semibold">
              Técnico cadastrado · acesso provisório
            </h2>
            <p>{created.email}</p>
            <p className="info-note">
              Esta senha aparece somente agora. Entregue ao técnico por canal
              seguro e separado. Não salve em arquivos do projeto. A troca será
              obrigatória no primeiro login.
            </p>
            <code className="block break-all select-all p-3">
              {created.password}
            </code>
            <div className="flex flex-wrap gap-3">
              <button
                className="button-secondary"
                onClick={() => void copySecret()}
              >
                Copiar senha
              </button>
              <button
                className="button-primary"
                autoFocus
                onClick={closeSecret}
              >
                Fechar e ocultar senha
              </button>
            </div>
            <p role="status">{notice}</p>
          </div>
        )}
      </dialog>
    </section>
  );
}
