import { useEffect, useState } from 'react';
import type {
  Category,
  CatalogService,
  PublicUser,
  CatalogQuery,
} from '@helpdesk/contracts';
import { categoryInputSchema, serviceInputSchema } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
type Kind = 'categories' | 'services';
type Editing = {
  kind: Kind;
  id?: string;
  name: string;
  description: string;
  displayOrder: number;
  isActive: boolean;
  categoryId: string;
};
export function Catalog({
  user,
  onExpired,
}: {
  user: PublicUser;
  onExpired: () => void;
}) {
  const admin = user.role === 'ADMIN';
  const [categories, setCategories] = useState<Category[]>([]),
    [services, setServices] = useState<CatalogService[]>([]),
    [knownCategories, setKnownCategories] = useState<Map<string, string>>(
      new Map(),
    ),
    [categoryTotal, setCategoryTotal] = useState(0),
    [serviceTotal, setServiceTotal] = useState(0),
    [categoryPage, setCategoryPage] = useState(1),
    [servicePage, setServicePage] = useState(1),
    [categoryText, setCategoryText] = useState(''),
    [categorySearch, setCategorySearch] = useState(''),
    [text, setText] = useState(''),
    [search, setSearch] = useState(''),
    [categoryStatus, setCategoryStatus] =
      useState<CatalogQuery['status']>('all'),
    [status, setStatus] = useState<CatalogQuery['status']>('all'),
    [selected, setSelected] = useState<Category | null>(null),
    [editing, setEditing] = useState<Editing | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let alive = true;
    Promise.all([
      authClient.categories({
        page: categoryPage,
        pageSize: 10,
        search: categorySearch,
        status: admin ? categoryStatus : 'active',
      }),
      authClient.services({
        page: servicePage,
        pageSize: 10,
        search,
        status: admin ? status : 'active',
        ...(selected ? { categoryId: selected.id } : {}),
      }),
    ])
      .then(([c, s]) => {
        if (alive) {
          setCategories(c.items);
          setCategoryTotal(c.total);
          setServices(s.items);
          setKnownCategories((previous) => {
            const next = new Map(previous);
            for (const category of c.items)
              next.set(category.id, category.name);
            for (const service of s.items)
              next.set(service.categoryId, service.category.name);
            return next;
          });
          setServiceTotal(s.total);
          setError('');
        }
      })
      .catch((e) => {
        if (alive) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else
            setError('Não foi possível consultar o catálogo. Tente novamente.');
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [
    admin,
    categoryPage,
    categorySearch,
    categoryStatus,
    servicePage,
    search,
    status,
    selected,
    revision,
    onExpired,
  ]);
  function reload() {
    setLoading(true);
    setRevision((n) => n + 1);
  }
  function start(kind: Kind, item?: Category | CatalogService) {
    setError('');
    setNotice('');
    setEditing({
      kind,
      ...(item ? { id: item.id } : {}),
      name: item?.name ?? '',
      description: item?.description ?? '',
      displayOrder: item?.displayOrder ?? 0,
      isActive: item?.isActive ?? true,
      categoryId:
        item && 'categoryId' in item
          ? item.categoryId
          : (selected?.id ?? categories[0]?.id ?? ''),
    });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busy || !admin) return;
    const { kind, id, name, description, isActive, displayOrder, categoryId } =
      editing;
    const input = { name, description, isActive, displayOrder };
    const parsed =
      kind === 'categories'
        ? categoryInputSchema.safeParse(input)
        : serviceInputSchema.safeParse({ ...input, categoryId });
    if (!parsed.success) {
      setError(
        'Informe nome (2–120 caracteres), categoria válida e ordem entre 0 e 100000.',
      );
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (kind === 'categories') {
        const result = id
          ? await authClient.updateCategory(
              id,
              categoryInputSchema.parse(parsed.data),
            )
          : await authClient.createCategory(
              categoryInputSchema.parse(parsed.data),
            );
        if (selected?.id === result.id) setSelected(result);
      } else {
        const data = serviceInputSchema.parse(parsed.data);
        if (id) await authClient.updateService(id, data);
        else await authClient.createService(data);
      }
      setNotice(
        'Catálogo salvo no PostgreSQL. O histórico dos chamados foi preservado.',
      );
      setEditing(null);
      reload();
    } catch (e) {
      if (e instanceof AuthError && e.status === 401) onExpired();
      else
        setError(
          e instanceof AuthError
            ? e.message
            : 'Não foi possível salvar o catálogo.',
        );
    } finally {
      setBusy(false);
    }
  }
  const categoryOptions = new Map(knownCategories);
  if (selected) categoryOptions.set(selected.id, selected.name);
  for (const s of services) categoryOptions.set(s.categoryId, s.category.name);
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Catálogo de serviços</h1>
          <p className="text-sm text-slate-500">
            {admin
              ? 'Categorias e serviços reais · administração'
              : 'Serviços disponíveis · consulta somente leitura'}
          </p>
        </div>
        <button
          className="button-secondary"
          disabled={loading || busy}
          onClick={reload}
        >
          Atualizar
        </button>
      </div>
      <p className="info-note">
        Cada chamado utilizará um único serviço. A abertura de chamados ainda
        está em desenvolvimento. Serviços novos possuem formulário básico com
        assunto e descrição; o editor de campos personalizados não está
        disponível.
      </p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {admin && editing && (
        <form
          className="panel p-5 space-y-4 max-w-2xl"
          onSubmit={(e) => void save(e)}
        >
          <h2 className="font-semibold">
            {editing.id ? 'Editar' : 'Criar'}{' '}
            {editing.kind === 'categories' ? 'categoria' : 'serviço'}
          </h2>
          <label className="block">
            Nome
            <input
              className="field w-full mt-2"
              required
              minLength={2}
              maxLength={120}
              disabled={busy}
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </label>
          <label className="block">
            Descrição
            <textarea
              className="field w-full mt-2"
              maxLength={2000}
              disabled={busy}
              value={editing.description}
              onChange={(e) =>
                setEditing({ ...editing, description: e.target.value })
              }
            />
          </label>
          {editing.kind === 'services' && (
            <label className="block">
              Categoria
              <select
                className="field w-full mt-2"
                required
                disabled={busy}
                value={editing.categoryId}
                onChange={(e) =>
                  setEditing({ ...editing, categoryId: e.target.value })
                }
              >
                <option value="">Selecione</option>
                {[...categoryOptions].map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <span className="text-sm text-slate-500">
                Para localizar outras categorias, use a busca e a paginação da
                listagem abaixo. Transferências são bloqueadas se o serviço já
                possui chamados.
              </span>
            </label>
          )}
          <label className="block">
            Ordem de exibição
            <input
              className="field w-full mt-2"
              type="number"
              required
              min={0}
              max={100000}
              disabled={busy}
              value={editing.displayOrder}
              onChange={(e) =>
                setEditing({ ...editing, displayOrder: Number(e.target.value) })
              }
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={editing.isActive}
              disabled={busy}
              onChange={(e) =>
                setEditing({ ...editing, isActive: e.target.checked })
              }
            />
            Ativo
          </label>
          <p className="info-note">
            Desativar preserva o histórico e impede novas solicitações. Uma
            categoria inativa torna todos os seus serviços indisponíveis, sem
            mudar a situação individual de cada um. Serviços ativos exigem
            categoria ativa.
          </p>
          <div className="flex gap-3">
            <button className="button-primary" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              className="button-secondary"
              type="button"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <section
        className="panel p-5 space-y-4"
        aria-labelledby="categories-title"
      >
        <div className="flex flex-wrap justify-between gap-3">
          <h2 id="categories-title" className="text-lg font-semibold">
            Categorias
          </h2>
          {admin && (
            <button
              className="button-primary"
              disabled={busy}
              onClick={() => start('categories')}
            >
              Nova categoria
            </button>
          )}
        </div>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setCategorySearch(categoryText.trim());
            setCategoryPage(1);
            reload();
          }}
        >
          <input
            className="field min-w-0 flex-1"
            type="search"
            maxLength={120}
            aria-label="Buscar categorias"
            placeholder="Buscar categorias"
            value={categoryText}
            onChange={(e) => setCategoryText(e.target.value)}
          />
          {admin && (
            <select
              className="field"
              aria-label="Situação das categorias"
              value={categoryStatus}
              onChange={(e) => {
                setCategoryStatus(e.target.value as CatalogQuery['status']);
                setCategoryPage(1);
                setLoading(true);
              }}
            >
              <option value="all">Todas</option>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
            </select>
          )}
          <button className="button-secondary">Buscar categorias</button>
        </form>
        {loading ? (
          <p role="status">Carregando catálogo…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Categorias cadastradas</caption>
              <thead>
                <tr>
                  <th className="p-3 text-left">Nome / descrição</th>
                  <th className="p-3 text-left">Ordem</th>
                  {admin && <th className="p-3 text-left">Situação</th>}
                  <th className="p-3 text-left">Ações</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 break-words">
                      <strong>{c.name}</strong>
                      <p>{c.description || 'Sem descrição'}</p>
                    </td>
                    <td className="p-3">{c.displayOrder}</td>
                    {admin && (
                      <td className="p-3">
                        {c.isActive ? 'Ativa' : 'Inativa'}
                      </td>
                    )}
                    <td className="p-3">
                      <div className="flex flex-wrap gap-3">
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelected(c);
                            setServicePage(1);
                            reload();
                          }}
                        >
                          Ver serviços
                        </button>
                        {admin && (
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => start('categories', c)}
                          >
                            Editar categoria
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!categories.length && (
              <p className="p-3">Nenhuma categoria encontrada.</p>
            )}
          </div>
        )}
        <Pager
          page={categoryPage}
          total={categoryTotal}
          loading={loading}
          change={(p) => {
            setCategoryPage(p);
            setLoading(true);
          }}
        />
      </section>
      <section className="panel p-5 space-y-4" aria-labelledby="services-title">
        <div className="flex flex-wrap justify-between gap-3">
          <h2 id="services-title" className="text-lg font-semibold">
            Serviços{selected ? ` · ${selected.name}` : ''}
          </h2>
          <div className="flex gap-3">
            {selected && (
              <button
                className="button-secondary"
                onClick={() => {
                  setSelected(null);
                  setServicePage(1);
                  setLoading(true);
                }}
              >
                Todas as categorias
              </button>
            )}
            {admin && (
              <button
                className="button-primary"
                disabled={busy || !categoryOptions.size}
                onClick={() => start('services')}
              >
                Novo serviço
              </button>
            )}
          </div>
        </div>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(text.trim());
            setServicePage(1);
            reload();
          }}
        >
          <input
            className="field min-w-0 flex-1"
            type="search"
            maxLength={120}
            aria-label="Buscar serviços"
            placeholder="Buscar serviços por nome ou descrição"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {admin && (
            <select
              className="field"
              aria-label="Situação dos serviços"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as CatalogQuery['status']);
                setServicePage(1);
                setLoading(true);
              }}
            >
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
          )}
          <button className="button-secondary">Buscar serviços</button>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setText('');
              setSearch('');
              setStatus('all');
              setServicePage(1);
              reload();
            }}
          >
            Limpar
          </button>
        </form>
        {loading ? (
          <p role="status">Carregando serviços…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Serviços cadastrados</caption>
              <thead>
                <tr>
                  <th className="p-3 text-left">Nome / descrição</th>
                  <th className="p-3 text-left">Categoria</th>
                  <th className="p-3 text-left">Ordem</th>
                  {admin && (
                    <>
                      <th className="p-3 text-left">Situação</th>
                      <th className="p-3 text-left">Ações</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3 break-words">
                      <strong>{s.name}</strong>
                      <p>{s.description || 'Sem descrição'}</p>
                    </td>
                    <td className="p-3">{s.category.name}</td>
                    <td className="p-3">{s.displayOrder}</td>
                    {admin && (
                      <>
                        <td className="p-3">
                          {s.isActive ? 'Ativo' : 'Inativo'}
                          {s.category.isActive === false && (
                            <p>Indisponível: categoria inativa</p>
                          )}
                        </td>
                        <td className="p-3">
                          <button
                            className="text-button"
                            disabled={busy}
                            onClick={() => start('services', s)}
                          >
                            Editar serviço
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {!services.length && (
              <p className="p-3">Nenhum serviço encontrado.</p>
            )}
          </div>
        )}
        <Pager
          page={servicePage}
          total={serviceTotal}
          loading={loading}
          change={(p) => {
            setServicePage(p);
            setLoading(true);
          }}
        />
      </section>
    </section>
  );
}
function Pager({
  page,
  total,
  loading,
  change,
}: {
  page: number;
  total: number;
  loading: boolean;
  change: (p: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        className="button-secondary"
        disabled={loading || page === 1}
        onClick={() => change(page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {page} · {total} registro(s)
      </span>
      <button
        className="button-secondary"
        disabled={loading || page * 10 >= total}
        onClick={() => change(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
