import type { FormField } from '@helpdesk/contracts';
import type { ReactNode } from 'react';
import { visibleFormKeys } from '@helpdesk/contracts';
import { attachmentAccept } from '../lib/attachment-display';
import { LocalAttachmentField } from './attachment-card';
export function DynamicServiceFields({
  fields,
  answers,
  onChange,
  disabled = false,
  renderFile,
}: {
  fields: FormField[];
  answers: Record<string, string | string[] | boolean | number>;
  onChange: (key: string, value: string | string[] | boolean | number) => void;
  disabled?: boolean;
  renderFile?: (field: FormField) => ReactNode;
}) {
  const visible = visibleFormKeys(fields, answers);
  return (
    <div className="space-y-4">
      {fields
        .filter((f) => visible.has(f.key))
        .map((f) =>
          f.type === 'FILE' ? (
            <fieldset key={f.id} className="space-y-2" disabled={disabled}>
              <legend className="form-label">
                {f.label}
                {f.required ? ' *' : ''}
              </legend>
              {f.description && (
                <p className="text-xs text-slate-500">{f.description}</p>
              )}
              {renderFile ? (
                renderFile(f)
              ) : (
                <LocalAttachmentField
                  label={f.label}
                  accept={attachmentAccept}
                  disabled={disabled}
                />
              )}
              {f.help && <p className="text-xs text-slate-500">{f.help}</p>}
            </fieldset>
          ) : (
            <label key={f.id} className="form-label block">
              {f.label}
              {f.required ? ' *' : ''}
              {f.description && (
                <span className="block text-xs font-normal text-slate-500">
                  {f.description}
                </span>
              )}
              {f.type === 'LONG_TEXT' ? (
                <textarea
                  className="field w-full"
                  value={String(answers[f.key] ?? '')}
                  required={f.required}
                  disabled={disabled}
                  onChange={(e) => onChange(f.key, e.target.value)}
                />
              ) : f.type === 'SELECT' || f.type === 'MULTI_SELECT' ? (
                <select
                  className="field w-full"
                  multiple={f.type === 'MULTI_SELECT'}
                  value={
                    f.type === 'MULTI_SELECT'
                      ? ((answers[f.key] as string[]) ?? [])
                      : String(answers[f.key] ?? '')
                  }
                  required={f.required}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(
                      f.key,
                      f.type === 'MULTI_SELECT'
                        ? Array.from(e.target.selectedOptions, (o) => o.value)
                        : e.target.value,
                    )
                  }
                >
                  {f.type === 'SELECT' && <option value="">Selecione</option>}
                  {f.options?.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.type === 'CHECKBOX_GROUP' ? (
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">{f.label}</legend>
                  {(f.options ?? []).map((option) => {
                    const selected = Array.isArray(answers[f.key])
                      ? (answers[f.key] as string[])
                      : [];
                    return (
                      <label
                        className="flex min-h-11 items-center gap-3"
                        key={option}
                      >
                        <input
                          type="checkbox"
                          checked={selected.includes(option)}
                          disabled={disabled}
                          onChange={(event) =>
                            onChange(
                              f.key,
                              event.target.checked
                                ? [...selected, option]
                                : selected.filter((item) => item !== option),
                            )
                          }
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </fieldset>
              ) : f.type === 'CHECKBOX' ? (
                <input
                  type="checkbox"
                  checked={answers[f.key] === true}
                  disabled={disabled}
                  onChange={(e) => onChange(f.key, e.target.checked)}
                />
              ) : (
                <input
                  className="field w-full"
                  step={f.type === 'NUMBER' ? 'any' : undefined}
                  type={
                    f.type === 'NUMBER'
                      ? 'number'
                      : f.type === 'EMAIL'
                        ? 'email'
                        : f.type === 'URL'
                          ? 'url'
                          : f.type === 'DATE'
                            ? 'date'
                            : f.type === 'DATE_TIME'
                              ? 'datetime-local'
                              : 'text'
                  }
                  value={String(answers[f.key] ?? '')}
                  required={f.required}
                  disabled={disabled}
                  onChange={(e) =>
                    onChange(
                      f.key,
                      f.type === 'NUMBER' && e.target.value !== ''
                        ? Number(e.target.value)
                        : e.target.value,
                    )
                  }
                />
              )}
              {f.help && (
                <span className="block text-xs font-normal text-slate-500">
                  {f.help}
                </span>
              )}
            </label>
          ),
        )}
    </div>
  );
}
