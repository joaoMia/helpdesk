import { useEffect, useState } from 'react';
import { authClient } from '../lib/auth-client';
import { Panel, PageHeading } from '../components/ui';
import { ServiceFormEditor } from '../components/service-form-editor';
import { DemoDialog } from '../components/demo-dialog';
type Category = Awaited<
  ReturnType<typeof authClient.projectCategories>
>[number];
export function AdminProjectCategories({
  onExpired,
}: {
  onExpired: () => void;
}) {
  const [items, setItems] = useState<Category[]>([]),
    [revision, setRevision] = useState(0),
    [error, setError] = useState(''),
    [editor, setEditor] = useState<string | null>(null),
    [editing, setEditing] = useState<Category | null | undefined>(undefined),
    [name, setName] = useState(''),
    [description, setDescription] = useState(''),
    [active, setActive] = useState(true),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  useEffect(() => {
    let alive = true;
    authClient
      .projectCategories()
      .then((v) => {
        if (alive) setItems(v);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [revision]);
  async function act(f: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = (await f()) as
        | { created?: number; existing?: number; conflicts?: string[] }
        | undefined;
      setRevision((v) => v + 1);
      setEditing(undefined);
      setNotice(
        result?.created !== undefined
          ? `Criadas: ${result.created}; existentes: ${result.existing}; conflitos preservados: ${result.conflicts?.length ?? 0}.`
          : 'Operação confirmada. Configurações existentes preservadas.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível confirmar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="CENTRAL ADMINISTRATIVA"
        title="Categorias e formulários de Projetos"
        description="Catálogo separado dos chamados; publicar cria uma versão imutável."
      />
      <div className="flex flex-wrap gap-3">
        <button
          className="button-primary"
          onClick={() => {
            setEditing(null);
            setName('');
            setDescription('');
            setActive(true);
          }}
        >
          Adicionar categoria
        </button>
        <button
          className="button-secondary"
          disabled={busy}
          onClick={() =>
            void act(() => authClient.bootstrapProjectCategories())
          }
        >
          Cadastrar modelos da prévia ausentes
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <Panel title="Categorias de Projetos">
        <div className="table-scroll">
          <table className="ticket-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.isActive ? 'Ativa' : 'Inativa'}</td>
                  <td>
                    <button
                      className="text-button mr-4"
                      onClick={() => {
                        setEditing(c);
                        setName(c.name);
                        setDescription(c.description);
                        setActive(c.isActive);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setEditor(c.id)}
                    >
                      Configurar formulário
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!items.length && (
          <p className="form-body">Nenhuma categoria cadastrada.</p>
        )}
      </Panel>
      {editor && (
        <ServiceFormEditor
          project
          id={editor}
          onExpired={onExpired}
          onClose={() => setEditor(null)}
        />
      )}
      {editing !== undefined && (
        <DemoDialog
          title="Categoria de Projeto"
          description="Desativação impede novas solicitações e preserva os registros anteriores."
          confirmLabel="Salvar"
          pending={busy}
          onCancel={() => setEditing(undefined)}
          onConfirm={() => {
            void act(() =>
              authClient.changeProjectCategory(editing?.id ?? null, {
                name,
                description,
                isActive: active,
                ...(editing ? { expectedRevision: editing.revision } : {}),
              }),
            );
            return false;
          }}
        >
          <label className="form-label">
            Nome
            <input
              className="field"
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="form-label">
            Descrição
            <textarea
              className="field"
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />{' '}
            Ativa
          </label>
        </DemoDialog>
      )}
    </>
  );
}
