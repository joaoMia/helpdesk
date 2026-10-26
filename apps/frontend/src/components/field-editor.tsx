import type { ServiceField } from '../forms/service-definitions';
export function FieldEditor({
  fields,
  onChange,
}: {
  fields: ServiceField[];
  onChange: (fields: ServiceField[]) => void;
}) {
  function change(index: number, patch: Partial<ServiceField>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Campos do formulário</h3>
        <button
          type="button"
          className="button-secondary"
          onClick={() =>
            onChange([
              ...fields,
              {
                id: 'field_' + crypto.randomUUID().slice(0, 8),
                label: 'Novo campo',
                kind: 'text',
              },
            ])
          }
        >
          + Adicionar campo
        </button>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Alterações somente no formulário demonstrativo. Condições referenciam um
        campo anterior; não há expressões ou código executável.
      </p>
      {fields.map((f, i) => (
        <fieldset className="field-editor" key={f.id}>
          <legend>
            Campo {i + 1} · {f.id}
          </legend>
          <div className="editor-grid">
            <label className="form-label">
              Rótulo do campo {i + 1}
              <input
                className="field"
                value={f.label}
                onChange={(e) => change(i, { label: e.target.value })}
                maxLength={100}
              />
            </label>
            <label className="form-label">
              Tipo do campo {i + 1}
              <select
                className="field"
                value={f.kind}
                onChange={(e) =>
                  change(i, { kind: e.target.value as ServiceField['kind'] })
                }
              >
                {Object.entries({
                  text: 'Texto curto',
                  textarea: 'Texto longo',
                  select: 'Seleção única',
                  multi: 'Múltipla seleção',
                  'datetime-local': 'Data e horário',
                  date: 'Data',
                  file: 'Anexo',
                  checkbox: 'Checkbox',
                  email: 'E-mail',
                  url: 'Site / URL',
                  number: 'Número',
                }).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-label">
              Orientação do campo {i + 1}
              <input
                className="field"
                value={f.hint ?? ''}
                onChange={(e) => change(i, { hint: e.target.value })}
                maxLength={200}
              />
            </label>
            <label className="option-chip self-end">
              <input
                type="checkbox"
                checked={!!f.required}
                onChange={(e) => change(i, { required: e.target.checked })}
              />
              Obrigatório (campo {i + 1})
            </label>
          </div>
          {['select', 'multi'].includes(f.kind) && (
            <label className="form-label mt-4">
              Opções do campo {i + 1} (separadas por vírgula)
              <input
                className="field"
                value={(f.options ?? []).join(', ')}
                onChange={(e) =>
                  change(i, {
                    options: e.target.value.split(',').map((v) => v.trim()),
                  })
                }
              />
            </label>
          )}
          <div className="editor-grid mt-4">
            <label className="form-label">
              Exibir campo {i + 1} quando
              <select
                className="field"
                value={f.when?.field ?? ''}
                onChange={(e) =>
                  change(i, {
                    when: e.target.value
                      ? { field: e.target.value, includes: '' }
                      : undefined,
                  })
                }
              >
                <option value="">Sempre</option>
                {fields
                  .slice(0, i)
                  .filter((p) =>
                    ['select', 'multi', 'checkbox', 'text'].includes(p.kind),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
              </select>
            </label>
            {f.when && (
              <label className="form-label">
                Valor da condição do campo {i + 1}
                <input
                  className="field"
                  value={f.when.includes}
                  placeholder="Ex.: TOTVS; para checkbox: yes"
                  onChange={(e) =>
                    change(i, {
                      when: { ...f.when!, includes: e.target.value },
                    })
                  }
                />
              </label>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="text-button text-xs"
              type="button"
              disabled={i === 0}
              onClick={() => {
                const copy = [...fields];
                [copy[i - 1], copy[i]] = [copy[i]!, copy[i - 1]!];
                onChange(copy);
              }}
            >
              Mover acima
            </button>
            <button
              className="text-button text-xs"
              type="button"
              disabled={i === fields.length - 1}
              onClick={() => {
                const copy = [...fields];
                [copy[i], copy[i + 1]] = [copy[i + 1]!, copy[i]!];
                onChange(copy);
              }}
            >
              Mover abaixo
            </button>
            <button
              className="text-button text-xs"
              type="button"
              onClick={() => onChange(fields.filter((_, n) => n !== i))}
            >
              Remover campo do rascunho
            </button>
          </div>
        </fieldset>
      ))}
    </section>
  );
}
