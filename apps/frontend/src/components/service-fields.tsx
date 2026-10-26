import type {
  ServiceAnswers,
  ServiceField,
} from '../forms/service-definitions';
import { visibleFields } from '../forms/service-definitions';

export function ServiceFields({
  serviceId,
  answers,
  onChange,
  errors = {},
  prefix = 'request',
  fields,
}: {
  serviceId: string;
  answers: ServiceAnswers;
  onChange: (answers: ServiceAnswers) => void;
  errors?: Record<string, string>;
  prefix?: string;
  fields?: ServiceField[];
}) {
  return (
    <div className="space-y-5" data-scroll-section>
      {visibleFields(serviceId, answers, fields).map((field) => {
        const id = `${prefix}-${serviceId}-${field.id}`,
          value = answers[field.id],
          errorId = errors[field.id] ? id + '-error' : undefined;
        const update = (next: string | string[]) =>
          onChange({ ...answers, [field.id]: next });
        const hintId = field.hint ? id + '-hint' : undefined;
        const described =
          [hintId, errorId].filter(Boolean).join(' ') || undefined;
        return (
          <div key={field.id}>
            {field.kind === 'multi' ? (
              <fieldset aria-describedby={described} aria-invalid={!!errorId}>
                <legend className="form-label mb-2">
                  {field.label}
                  {field.required ? ' *' : ''}
                </legend>
                <div className="flex flex-wrap gap-3">
                  {field.options?.map((option) => (
                    <label key={option} className="option-chip">
                      <input
                        type="checkbox"
                        className="accent-teal-700"
                        checked={Array.isArray(value) && value.includes(option)}
                        onChange={(e) =>
                          update(
                            e.target.checked
                              ? [...(Array.isArray(value) ? value : []), option]
                              : (Array.isArray(value) ? value : []).filter(
                                  (v) => v !== option,
                                ),
                          )
                        }
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <label className="form-label" htmlFor={id}>
                {field.label}
                {field.required ? (
                  ' *'
                ) : (
                  <span className="text-xs font-normal text-slate-500">
                    Opcional
                  </span>
                )}
              </label>
            )}
            {field.kind === 'select' ? (
              <select
                id={id}
                className="field mt-2"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => update(e.target.value)}
                aria-required={field.required}
                aria-invalid={!!errorId}
                aria-describedby={described}
              >
                <option value="">Selecione uma opção</option>
                {field.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : field.kind === 'checkbox' ? (
              <input
                id={id}
                className="mt-3 size-5 accent-teal-700"
                type="checkbox"
                checked={value === 'yes'}
                onChange={(e) => update(e.target.checked ? 'yes' : 'no')}
                aria-required={field.required}
                aria-invalid={!!errorId}
                aria-describedby={described}
              />
            ) : field.kind === 'textarea' ? (
              <textarea
                id={id}
                className="field mt-2 min-h-24"
                maxLength={3000}
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => update(e.target.value)}
                aria-required={field.required}
                aria-invalid={!!errorId}
                aria-describedby={described}
              />
            ) : field.kind === 'file' ? (
              <div className="attachment-box mt-2 flex-wrap">
                <input
                  id={id}
                  type="file"
                  className="w-full min-w-0 text-xs"
                  onChange={(e) => update(e.target.files?.[0]?.name ?? '')}
                  aria-required={field.required}
                  aria-invalid={!!errorId}
                  aria-describedby={described}
                />
                {value && (
                  <p className="break-all text-xs text-slate-500">
                    Selecionado: {String(value)} · sem upload
                  </p>
                )}
              </div>
            ) : field.kind !== 'multi' ? (
              <input
                id={id}
                className="field mt-2"
                type={field.kind}
                onInput={(e) => {
                  if (field.kind === 'date' || field.kind === 'datetime-local')
                    update(e.currentTarget.value);
                }}
                maxLength={500}
                min={field.kind === 'number' ? 0 : undefined}
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => update(e.target.value)}
                aria-required={field.required}
                aria-invalid={!!errorId}
                aria-describedby={described}
              />
            ) : null}
            {field.hint && (
              <p id={hintId} className="mt-2 text-xs leading-5 text-slate-500">
                {field.hint}
              </p>
            )}
            {errorId && (
              <p id={errorId} className="mt-2 text-sm text-red-700">
                {errors[field.id]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
export function ServiceAnswerSummary({
  serviceId,
  answers,
  fields,
}: {
  serviceId: string;
  answers: ServiceAnswers;
  fields?: ServiceField[];
}) {
  const visible = visibleFields(serviceId, answers, fields);
  if (!visible.length)
    return (
      <p className="text-sm text-slate-500">Sem campos adicionais definidos.</p>
    );
  return (
    <dl className="answer-grid">
      {visible.map((f) => (
        <div key={f.id}>
          <dt className="detail-label">{f.label}</dt>
          <dd className="whitespace-pre-wrap break-words text-sm text-slate-700">
            {Array.isArray(answers[f.id])
              ? (answers[f.id] as string[]).join(', ')
              : f.kind === 'checkbox'
                ? answers[f.id] === 'yes'
                  ? 'Sim'
                  : 'Não'
                : answers[f.id] || 'Não informado'}
            {f.kind === 'file' && answers[f.id] ? ' · nome demonstrativo' : ''}
          </dd>
        </div>
      ))}
    </dl>
  );
}
