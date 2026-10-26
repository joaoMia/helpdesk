import { useNotifications } from '../hooks/use-notifications';
import { scrollToContent } from '../lib/motion';
import { useEffect, useState } from 'react';
import type { DemoCatalog, DemoCategory, DemoService } from '../types/demo';
import type { ServiceAnswers } from '../forms/service-definitions';
import { validateAnswers } from '../forms/service-definitions';
import { validateCatalog } from '../mocks/catalog';
import { FieldEditor } from '../components/field-editor';
import { ServiceFields } from '../components/service-fields';
import { MotionRegion } from '../components/motion-region';
import { EmptyState, Icon, PageHeading, Panel } from '../components/ui';

export function ServiceCatalog({
  catalog,
  onChange,
}: {
  catalog: DemoCatalog;
  onChange: (catalog: DemoCatalog) => void;
}) {
  const { notify } = useNotifications();
  const [categoryId, setCategoryId] = useState(catalog.categories[0]?.id ?? ''),
    [categoryDraft, setCategoryDraft] = useState<DemoCategory | null>(null),
    [serviceDraft, setServiceDraft] = useState<DemoService | null>(null),
    [preview, setPreview] = useState(false),
    [query, setQuery] = useState(''),
    [notice, setNotice] = useState('');
  const [answers, setAnswers] = useState<ServiceAnswers>({}),
    [errors, setErrors] = useState<Record<string, string>>({});
  const editorId = serviceDraft?.id ?? categoryDraft?.id;
  useEffect(() => {
    if (!editorId) return;
    const editor = document.querySelector<HTMLElement>('.catalog-editor');
    scrollToContent(editor);
    editor
      ?.querySelector<HTMLElement>('input, select, button')
      ?.focus({ preventScroll: true });
  }, [editorId, preview]);
  const category = catalog.categories.find((c) => c.id === categoryId);
  function apply(next: DemoCatalog) {
    const problems = validateCatalog(next);
    if (problems.length) {
      setNotice(problems.join(' '));
      notify('error', problems.join(' '));
      return false;
    }
    onChange(next);
    setNotice(
      'Catálogo atualizado somente nesta sessão. Chamados existentes preservam seus snapshots.',
    );
    return true;
  }
  function saveCategory() {
    if (!categoryDraft) return;
    const next = {
      ...catalog,
      categories: catalog.categories.some((c) => c.id === categoryDraft.id)
        ? catalog.categories.map((c) =>
            c.id === categoryDraft.id ? categoryDraft : c,
          )
        : [...catalog.categories, categoryDraft],
    };
    if (apply(next)) {
      setCategoryId(categoryDraft.id);
      setCategoryDraft(null);
    }
  }
  function saveService() {
    if (!serviceDraft) return;
    const next = {
      ...catalog,
      services: catalog.services.some((s) => s.id === serviceDraft.id)
        ? catalog.services.map((s) =>
            s.id === serviceDraft.id ? structuredClone(serviceDraft) : s,
          )
        : [...catalog.services, structuredClone(serviceDraft)],
    };
    if (apply(next)) {
      setServiceDraft(null);
      setPreview(false);
    }
  }
  function editService(service: DemoService) {
    setServiceDraft(structuredClone(service));
    setCategoryDraft(null);
    setPreview(false);
    setAnswers({});
    setErrors({});
  }
  const services = catalog.services
    .filter(
      (s) =>
        s.categoryId === categoryId &&
        `${s.name} ${s.description}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => a.order - b.order);
  return (
    <>
      <PageHeading
        eyebrow="ADMINISTRAÇÃO · CATÁLOGO DEMONSTRATIVO"
        title="Serviços e categorias"
        description="Configure a experiência de solicitação e teste o resultado entre os perfis. Alterações apenas em memória, sem segurança ou persistência reais."
      >
        <button
          className="button-primary"
          onClick={() => {
            setCategoryDraft({
              id: 'cat_' + crypto.randomUUID().slice(0, 8),
              name: '',
              description: '',
              active: true,
              order: catalog.categories.length,
            });
            setServiceDraft(null);
          }}
        >
          + Criar categoria
        </button>
      </PageHeading>
      {notice && (
        <p className="info-note mb-5" role="status">
          {notice}
        </p>
      )}
      <div className="catalog-layout">
        <aside className="panel p-4">
          <h2 className="mb-4 px-2 font-semibold">Categorias</h2>
          {[...catalog.categories]
            .sort((a, b) => a.order - b.order)
            .map((c) => (
              <button
                key={c.id}
                className={`catalog-category ${c.id === categoryId ? 'catalog-selected' : ''}`}
                onClick={() => {
                  setCategoryId(c.id);
                  setServiceDraft(null);
                  setCategoryDraft(null);
                  setQuery('');
                }}
              >
                <span>{c.name}</span>
                <span className="text-[10px]">
                  {c.active ? 'Ativa' : 'Inativa'}
                </span>
              </button>
            ))}
        </aside>
        <div className="min-w-0 space-y-6">
          {categoryDraft ? (
            <MotionRegion
              motionKey="category-editor"
              className="catalog-editor scroll-mt-24"
            >
              <Panel title="Editar categoria">
                <form
                  className="form-body"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveCategory();
                  }}
                >
                  <label className="form-label">
                    Nome da categoria *
                    <input
                      className="field"
                      value={categoryDraft.name}
                      required
                      maxLength={100}
                      onChange={(e) =>
                        setCategoryDraft({
                          ...categoryDraft,
                          name: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="form-label">
                    Descrição da categoria
                    <textarea
                      className="field"
                      value={categoryDraft.description}
                      maxLength={500}
                      onChange={(e) =>
                        setCategoryDraft({
                          ...categoryDraft,
                          description: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="form-label">
                    Ordem da categoria
                    <input
                      className="field"
                      type="number"
                      value={categoryDraft.order}
                      onChange={(e) =>
                        setCategoryDraft({
                          ...categoryDraft,
                          order: Number(e.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="option-chip">
                    <input
                      type="checkbox"
                      checked={categoryDraft.active}
                      onChange={(e) =>
                        setCategoryDraft({
                          ...categoryDraft,
                          active: e.target.checked,
                        })
                      }
                    />
                    Categoria ativa
                  </label>
                  <div className="flex gap-3">
                    <button className="button-primary" type="submit">
                      Salvar categoria na sessão
                    </button>
                    <button
                      className="button-secondary"
                      type="button"
                      onClick={() => setCategoryDraft(null)}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </Panel>
            </MotionRegion>
          ) : null}
          {category && (
            <Panel
              title={category.name}
              subtitle={category.description}
              action={
                <div className="flex flex-wrap gap-3">
                  <button
                    className="text-button text-xs"
                    onClick={() => {
                      setCategoryDraft({ ...category });
                      setServiceDraft(null);
                    }}
                  >
                    Editar categoria
                  </button>
                  <button
                    className="text-button text-xs"
                    onClick={() =>
                      apply({
                        ...catalog,
                        categories: catalog.categories.map((c) =>
                          c.id === category.id
                            ? { ...c, active: !c.active }
                            : c,
                        ),
                      })
                    }
                  >
                    {category.active
                      ? 'Desativar categoria'
                      : 'Ativar categoria'}
                  </button>
                </div>
              }
            >
              <div className="filter-bar">
                <label className="search-field">
                  <Icon name="search" />
                  <span className="sr-only">Buscar serviços</span>
                  <input
                    value={query}
                    placeholder="Buscar serviço nesta categoria"
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <button
                  className="button-secondary"
                  onClick={() =>
                    editService({
                      id: 'srv_' + crypto.randomUUID().slice(0, 8),
                      categoryId: category.id,
                      name: '',
                      description: '',
                      active: true,
                      order: services.length,
                      fields: [],
                    })
                  }
                >
                  + Criar serviço
                </button>
              </div>
              {services.length ? (
                <div className="table-scroll">
                  <table className="directory-table">
                    <caption className="sr-only">
                      Serviços desta categoria
                    </caption>
                    <thead>
                      <tr>
                        <th>Serviço</th>
                        <th>Situação</th>
                        <th>Formulário</th>
                        <th>Ações demonstrativas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <strong>{s.name}</strong>
                            <p className="text-xs text-slate-500">
                              {s.description}
                            </p>
                          </td>
                          <td>
                            <span
                              className={`badge ${s.active ? 'status-closed' : 'status-open'}`}
                            >
                              {s.active ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td>{s.fields.length} campos</td>
                          <td>
                            <div className="flex flex-wrap gap-3">
                              <button
                                className="text-button text-xs"
                                onClick={() => editService(s)}
                              >
                                Editar {s.name}
                              </button>
                              <button
                                className="text-button text-xs"
                                onClick={() => {
                                  editService(s);
                                  setPreview(true);
                                }}
                              >
                                Prévia de {s.name}
                              </button>
                              <button
                                className="text-button text-xs"
                                onClick={() =>
                                  apply({
                                    ...catalog,
                                    services: catalog.services.map((v) =>
                                      v.id === s.id
                                        ? { ...v, active: !v.active }
                                        : v,
                                    ),
                                  })
                                }
                              >
                                {s.active ? 'Desativar' : 'Ativar'} {s.name}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState title="Nenhum serviço nesta seleção">
                  Crie um serviço ou altere a busca.
                </EmptyState>
              )}
            </Panel>
          )}
          {serviceDraft && (
            <MotionRegion
              className="catalog-editor scroll-mt-24"
              motionKey={'service-' + serviceDraft.id + '-' + preview}
            >
              <Panel
                title={
                  preview
                    ? `Prévia: ${serviceDraft.name}`
                    : 'Configurar serviço'
                }
                subtitle="A definição salva afeta somente novas solicitações desta sessão."
                action={
                  <button
                    className="text-button text-xs"
                    onClick={() => setPreview(!preview)}
                  >
                    {preview ? 'Voltar ao editor' : 'Pré-visualizar formulário'}
                  </button>
                }
              >
                {preview ? (
                  <form
                    noValidate
                    className="form-body"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const next = validateAnswers(
                        serviceDraft.id,
                        answers,
                        serviceDraft.fields,
                      );
                      setErrors(next);
                      setNotice(
                        Object.keys(next).length
                          ? 'Revise os campos indicados.'
                          : 'Formulário válido localmente; nenhum chamado foi criado.',
                      );
                    }}
                  >
                    <p className="info-note">
                      Na abertura, assunto e descrição aparecem junto a estes
                      campos na etapa 3.
                    </p>
                    <ServiceFields
                      serviceId={serviceDraft.id}
                      fields={serviceDraft.fields}
                      answers={answers}
                      onChange={setAnswers}
                      errors={errors}
                      prefix="catalog"
                    />
                    <button className="button-secondary" type="submit">
                      Validar prévia do formulário
                    </button>
                  </form>
                ) : (
                  <form
                    className="form-body"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveService();
                    }}
                  >
                    <div className="editor-grid">
                      <label className="form-label">
                        Nome do serviço *
                        <input
                          className="field"
                          required
                          maxLength={120}
                          value={serviceDraft.name}
                          onChange={(e) =>
                            setServiceDraft({
                              ...serviceDraft,
                              name: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="form-label">
                        Categoria do serviço
                        <select
                          className="field"
                          value={serviceDraft.categoryId}
                          onChange={(e) =>
                            setServiceDraft({
                              ...serviceDraft,
                              categoryId: e.target.value,
                            })
                          }
                        >
                          {catalog.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="form-label">
                        Ordem do serviço
                        <input
                          className="field"
                          type="number"
                          value={serviceDraft.order}
                          onChange={(e) =>
                            setServiceDraft({
                              ...serviceDraft,
                              order: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="option-chip self-end">
                        <input
                          type="checkbox"
                          checked={serviceDraft.active}
                          onChange={(e) =>
                            setServiceDraft({
                              ...serviceDraft,
                              active: e.target.checked,
                            })
                          }
                        />
                        Serviço ativo
                      </label>
                    </div>
                    <label className="form-label">
                      Descrição do serviço
                      <textarea
                        className="field"
                        maxLength={500}
                        value={serviceDraft.description}
                        onChange={(e) =>
                          setServiceDraft({
                            ...serviceDraft,
                            description: e.target.value,
                          })
                        }
                      />
                    </label>
                    <FieldEditor
                      fields={serviceDraft.fields}
                      onChange={(fields) =>
                        setServiceDraft({ ...serviceDraft, fields })
                      }
                    />
                    <div className="flex flex-wrap gap-3">
                      <button className="button-primary" type="submit">
                        Salvar serviço na sessão
                      </button>
                      <button
                        className="button-secondary"
                        type="button"
                        onClick={() => setServiceDraft(null)}
                      >
                        Cancelar edição
                      </button>
                    </div>
                  </form>
                )}
              </Panel>
            </MotionRegion>
          )}
        </div>
      </div>
    </>
  );
}
