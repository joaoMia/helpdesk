import {
  serviceFormTemplates,
  makeServiceFormTemplate,
} from '../lib/service-form-templates';
import { useEffect, useRef, useState } from 'react';
import type { EditableForm, FormField, ServiceForm } from '@helpdesk/contracts';
import { editableFormSchema } from '@helpdesk/contracts';
import { authClient, AuthError } from '../lib/auth-client';
import { DemoDialog } from './demo-dialog';
import { DynamicServiceFields } from './dynamic-service-fields';
const projectFormApi = {
  serviceForm: authClient.projectCategoryForm,
  saveServiceForm: authClient.saveProjectCategoryForm,
  publishServiceForm: authClient.publishProjectCategoryForm,
};
const labels = {
  TEXT: 'Texto',
  LONG_TEXT: 'Descrição longa',
  NUMBER: 'Número',
  DATE: 'Data',
  DATE_TIME: 'Data e horário',
  EMAIL: 'E-mail',
  URL: 'URL',
  SELECT: 'Seleção única',
  MULTI_SELECT: 'Seleção múltipla',
  CHECKBOX: 'Checkbox',
  CHECKBOX_GROUP: 'Grupo de checkboxes',
  FILE: 'Anexo',
};
export function ServiceFormEditor({
  id,
  project = false,
  onClose,
  onExpired,
}: {
  id: string;
  project?: boolean;
  onClose: () => void;
  onExpired: () => void;
}) {
  const api = project ? projectFormApi : authClient;
  const [template, setTemplate] = useState('');
  const [saved, setSaved] = useState('');
  const [data, setData] = useState<ServiceForm | null>(null),
    [draft, setDraft] = useState<EditableForm | null>(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [preview, setPreview] = useState(false),
    [answers, setAnswers] = useState<
      Record<string, string | string[] | boolean | number>
    >({}),
    [history, setHistory] = useState<ServiceForm['published']>(null),
    [discard, setDiscard] = useState(false);
  const [optionsField, setOptionsField] = useState<number | null>(null),
    [optionsDraft, setOptionsDraft] = useState<string[]>([]),
    [previousOptionsType, setPreviousOptionsType] = useState<{
      index: number;
      type: FormField['type'];
      options?: string[];
    } | null>(null);
  const alive = useRef(true),
    pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    let active = true;
    api
      .serviceForm(id)
      .then((r) => {
        if (active) {
          setData(r);
          const d =
            r.draft?.definition ??
            (r.published
              ? {
                  title: r.published.title,
                  description: r.published.description,
                  fields: r.published.fields,
                }
              : { title: '', description: '', fields: [] });
          setDraft(d);
          setRevision(r.draft?.revision ?? 0);
          setSaved(JSON.stringify(d));
        }
      })
      .catch((e) => {
        if (active) {
          if (e instanceof AuthError && e.status === 401) onExpired();
          else setError('Não foi possível carregar o formulário.');
        }
      });
    return () => {
      active = false;
      alive.current = false;
    };
  }, [id, onExpired, api]);
  const dirty = !!draft && saved !== JSON.stringify(draft);
  function close() {
    if (busy) return;
    if (dirty) {
      setDiscard(true);
      return;
    }
    onClose();
  }
  function update(index: number, patch: Partial<FormField>) {
    if (!draft) return;
    setDraft({
      ...draft,
      fields: draft.fields.map((f, i) =>
        i === index ? { ...f, ...patch } : f,
      ),
    });
  }
  function move(i: number, delta: number) {
    if (!draft) return;
    const f = [...draft.fields],
      j = i + delta;
    if (j < 0 || j >= f.length) return;
    [f[i], f[j]] = [f[j]!, f[i]!];
    setDraft({ ...draft, fields: f });
  }
  async function save(publish = false) {
    if (!draft || pending.current) return;
    const parsed = editableFormSchema.safeParse(draft);
    if (!parsed.success) {
      setError(
        'Revise rótulos, opções distintas e condições que referenciem campos anteriores.',
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (publish) {
        if (dirty || !revision) {
          setError('Salve o rascunho antes de publicar.');
          return;
        }
        await api.publishServiceForm(id, { expectedRevision: revision });
      } else
        await api.saveServiceForm(id, {
          expectedRevision: revision,
          definition: parsed.data,
        });
      const r = await api.serviceForm(id);
      if (alive.current) {
        setData(r);
        setRevision(r.draft?.revision ?? 0);
        const d = r.draft?.definition ?? {
          title: r.published?.title ?? '',
          description: r.published?.description ?? '',
          fields: r.published?.fields ?? [],
        };
        setDraft(d);
        setSaved(JSON.stringify(d));
        setNotice(
          publish
            ? project
              ? 'Versão publicada. Projetos anteriores foram preservados.'
              : 'Versão publicada. Chamados anteriores foram preservados.'
            : 'Rascunho salvo.',
        );
      }
    } catch (e) {
      if (alive.current) {
        if (e instanceof AuthError && e.status === 401) onExpired();
        else
          setError(
            e instanceof AuthError
              ? e.message
              : 'Não foi possível confirmar a operação. Recarregue antes de tentar novamente.',
          );
      }
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  return (
    <DemoDialog
      title={
        project ? 'Formulário da categoria de Projeto' : 'Formulário do serviço'
      }
      eyebrow="CATÁLOGO REAL · VERSIONADO"
      pending={busy}
      onCancel={close}
      cancelLabel="Fechar"
    >
      <div className="space-y-5">
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="info-note" role="status">
            {notice}
          </p>
        )}
        {!draft ? (
          <p role="status">Carregando…</p>
        ) : (
          <>
            <p className="info-note">
              Não solicite senhas ou credenciais. Publicar cria uma nova versão;
              o histórico das solicitações permanece preservado.
            </p>
            {!project && (
              <div className="info-note space-y-3">
                <label className="form-label">
                  Modelo de referência
                  <select
                    className="field w-full"
                    value={template}
                    disabled={busy}
                    onChange={(e) => setTemplate(e.target.value)}
                  >
                    <option value="">Sem modelo</option>
                    {serviceFormTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button-secondary"
                  disabled={busy || !template}
                  onClick={() => {
                    if (dirty) {
                      setError(
                        'Salve o rascunho ou descarte as alterações antes de carregar um modelo.',
                      );
                      return;
                    }
                    setDraft(makeServiceFormTemplate(template));
                    setAnswers({});
                    setNotice(
                      'Modelo carregado no rascunho. Revise opções, obrigatoriedade e condições antes de salvar e publicar.',
                    );
                  }}
                >
                  Carregar referência no rascunho
                </button>
                <p className="text-xs">
                  Nenhum formulário é publicado automaticamente. Campos de anexo
                  utilizam upload privado na abertura do chamado.
                </p>
              </div>
            )}
            {project && (
              <p className="info-note">
                Arquivos dos formulários de Projetos usam upload privado. Campos
                obrigatórios e condicionais são validados novamente no servidor.
              </p>
            )}
            <label className="form-label">
              Nome do formulário
              <input
                className="field w-full"
                maxLength={200}
                value={draft.title}
                disabled={busy}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="form-label">
              Descrição
              <textarea
                className="field w-full"
                maxLength={2000}
                value={draft.description}
                disabled={busy}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className="button-secondary"
                disabled={busy || draft.fields.length >= 50}
                onClick={() =>
                  setDraft({
                    ...draft,
                    fields: [
                      ...draft.fields,
                      {
                        id: crypto.randomUUID(),
                        key: 'campo_' + crypto.randomUUID().replaceAll('-', ''),
                        label: 'Novo campo',
                        type: 'TEXT',
                        required: false,
                      },
                    ],
                  })
                }
              >
                Adicionar campo
              </button>
              <button
                className="button-secondary"
                onClick={() => setPreview(!preview)}
              >
                {preview ? 'Voltar ao editor' : 'Prévia'}
              </button>
            </div>
            {preview ? (
              <DynamicServiceFields
                fields={draft.fields}
                answers={answers}
                onChange={(k, v) => setAnswers((a) => ({ ...a, [k]: v }))}
              />
            ) : (
              draft.fields.map((f, i) => (
                <section key={f.id} className="panel p-4 space-y-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>Campo {i + 1}</strong>
                    <div className="flex gap-3">
                      <button
                        className="text-button"
                        disabled={busy || i === 0}
                        onClick={() => move(i, -1)}
                      >
                        Subir
                      </button>
                      <button
                        className="text-button"
                        disabled={busy || i === draft.fields.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        Descer
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            fields: draft.fields.filter((_, n) => n !== i),
                          })
                        }
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                  <label className="form-label">
                    Rótulo
                    <input
                      className="field w-full"
                      value={f.label}
                      disabled={busy}
                      onChange={(e) => update(i, { label: e.target.value })}
                    />
                  </label>
                  <label className="form-label">
                    Tipo
                    <select
                      className="field w-full"
                      value={f.type}
                      disabled={busy}
                      onChange={(e) => {
                        const type = e.target.value as FormField['type'];
                        update(i, {
                          type,
                          options: [
                            'SELECT',
                            'MULTI_SELECT',
                            'CHECKBOX_GROUP',
                          ].includes(type)
                            ? (f.options ?? ['Opção'])
                            : undefined,
                        });
                        if (
                          ['SELECT', 'MULTI_SELECT', 'CHECKBOX_GROUP'].includes(
                            type,
                          )
                        ) {
                          setPreviousOptionsType({
                            index: i,
                            type: f.type,
                            options: f.options,
                          });
                          setOptionsField(i);
                          setOptionsDraft(
                            f.options?.length
                              ? [...f.options]
                              : ['Opção 1', 'Opção 2'],
                          );
                        }
                      }}
                    >
                      {Object.entries(labels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-label">
                    Descrição
                    <input
                      className="field w-full"
                      value={f.description ?? ''}
                      disabled={busy}
                      onChange={(e) =>
                        update(i, { description: e.target.value })
                      }
                    />
                  </label>
                  <label className="form-label">
                    Ajuda
                    <input
                      className="field w-full"
                      value={f.help ?? ''}
                      disabled={busy}
                      onChange={(e) => update(i, { help: e.target.value })}
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={f.required}
                      disabled={busy}
                      onChange={(e) =>
                        update(i, { required: e.target.checked })
                      }
                    />
                    Obrigatório
                  </label>
                  {['SELECT', 'MULTI_SELECT', 'CHECKBOX_GROUP'].includes(
                    f.type,
                  ) && (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-500">
                        {f.options?.length ?? 0} opção(ões) configuradas
                      </p>
                      <button
                        type="button"
                        className="button-secondary"
                        disabled={busy}
                        onClick={() => {
                          setOptionsField(i);
                          setOptionsDraft([...(f.options ?? [])]);
                        }}
                      >
                        Configurar opções
                      </button>
                    </div>
                  )}
                  <label className="form-label">
                    Exibir quando
                    <select
                      className="field w-full"
                      value={f.condition?.field ?? ''}
                      disabled={busy}
                      onChange={(e) =>
                        update(i, {
                          condition: e.target.value
                            ? { field: e.target.value, includes: '' }
                            : undefined,
                        })
                      }
                    >
                      <option value="">Sempre visível</option>
                      {draft.fields.slice(0, i).map((p) => (
                        <option key={p.id} value={p.key}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {f.condition && (
                    <label className="form-label">
                      Valor que ativa o campo
                      <input
                        className="field w-full"
                        value={f.condition.includes}
                        disabled={busy}
                        onChange={(e) =>
                          update(i, {
                            condition: {
                              ...f.condition!,
                              includes: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  )}
                </section>
              ))
            )}
            <div className="flex flex-wrap gap-3">
              <button
                className="button-primary"
                disabled={busy}
                onClick={() => void save()}
              >
                {busy ? 'Processando…' : 'Salvar rascunho'}
              </button>
              <button
                className="button-secondary"
                disabled={busy || dirty || !revision || data?.draft?.published}
                onClick={() => void save(true)}
              >
                Publicar nova versão
              </button>
            </div>
            <label className="form-label">
              Versões publicadas
              <select
                className="field w-full"
                value={history?.version ?? ''}
                onChange={async (e) => {
                  if (!e.target.value) {
                    setHistory(null);
                    return;
                  }
                  try {
                    const r = await api.serviceForm(id, Number(e.target.value));
                    if (alive.current) setHistory(r.published);
                  } catch (err) {
                    if (err instanceof AuthError && err.status === 401)
                      onExpired();
                    else setError('Não foi possível carregar a versão.');
                  }
                }}
              >
                <option value="">Selecione para consultar</option>
                {data?.versions?.map((v) => (
                  <option key={v.id} value={v.version}>
                    Versão {v.version} · {v.title || 'Formulário básico'}
                  </option>
                ))}
              </select>
            </label>
            {history && (
              <section className="info-note">
                <strong>
                  {history.title} · v{history.version}
                </strong>
                <p>{history.description}</p>
                <ul>
                  {history.fields.map((f) => (
                    <li key={f.id}>
                      {f.label} · {labels[f.type]}
                      {f.required ? ' · obrigatório' : ''}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        {discard && (
          <section className="info-note" role="alert">
            <p>Descartar alterações não salvas?</p>
            <button
              className="button-secondary"
              onClick={() => setDiscard(false)}
            >
              Continuar editando
            </button>
            <button className="button-secondary" onClick={onClose}>
              Descartar alterações
            </button>
          </section>
        )}
        {optionsField !== null && draft?.fields[optionsField] && (
          <DemoDialog
            title="Configurar opções"
            eyebrow={
              draft.fields[optionsField].type === 'SELECT'
                ? 'SELEÇÃO ÚNICA'
                : 'SELEÇÃO MÚLTIPLA'
            }
            description="As opções fazem parte da versão publicada do formulário. Reordene e revise antes de salvar o rascunho."
            confirmLabel="Salvar opções"
            cancelLabel="Cancelar"
            onCancel={() => {
              if (previousOptionsType)
                update(previousOptionsType.index, {
                  type: previousOptionsType.type,
                  options: previousOptionsType.options,
                });
              setPreviousOptionsType(null);
              setOptionsField(null);
            }}
            onConfirm={() => {
              const clean = optionsDraft.map((x) => x.trim());
              if (
                clean.some((x) => !x) ||
                new Set(clean.map((x) => x.toLocaleLowerCase('pt-BR'))).size !==
                  clean.length
              ) {
                setError('Preencha todas as opções e remova duplicatas.');
                return;
              }
              if (!clean.length) {
                setError('Cadastre ao menos uma opção.');
                return;
              }
              update(optionsField, { options: clean });
              setPreviousOptionsType(null);
              setOptionsField(null);
              setError('');
            }}
          >
            <div className="space-y-3">
              {optionsDraft.map((option, index) => (
                <div className="flex items-center gap-2" key={index}>
                  <span className="text-xs text-slate-500">{index + 1}.</span>
                  <input
                    className="field"
                    aria-label={`Opção ${index + 1}`}
                    maxLength={200}
                    value={option}
                    onChange={(e) =>
                      setOptionsDraft((items) =>
                        items.map((x, i) => (i === index ? e.target.value : x)),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Mover opção ${index + 1} para cima`}
                    disabled={index === 0}
                    onClick={() =>
                      setOptionsDraft((items) => {
                        const next = [...items];
                        [next[index - 1], next[index]] = [
                          next[index]!,
                          next[index - 1]!,
                        ];
                        return next;
                      })
                    }
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Mover opção ${index + 1} para baixo`}
                    disabled={index === optionsDraft.length - 1}
                    onClick={() =>
                      setOptionsDraft((items) => {
                        const next = [...items];
                        [next[index], next[index + 1]] = [
                          next[index + 1]!,
                          next[index]!,
                        ];
                        return next;
                      })
                    }
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    aria-label={`Remover opção ${index + 1}`}
                    onClick={() =>
                      setOptionsDraft((items) =>
                        items.filter((_, i) => i !== index),
                      )
                    }
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button-secondary"
                disabled={optionsDraft.length >= 100}
                onClick={() => setOptionsDraft((items) => [...items, ''])}
              >
                Adicionar opção
              </button>
            </div>
          </DemoDialog>
        )}
      </div>
    </DemoDialog>
  );
}
