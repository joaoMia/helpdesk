import type { ScheduleInput } from '@helpdesk/contracts';
import { DemoDialog } from './demo-dialog';
import { days, time, minute } from '../lib/work-schedule-presentation';
export type EditableSchedule = ScheduleInput & { id?: string };
export function ScheduleEditorDialog({
  draft,
  setDraft,
  busy,
  error,
  onCancel,
  onSave: save,
}: {
  draft: EditableSchedule;
  setDraft: (v: EditableSchedule) => void;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onSave: () => Promise<void>;
}) {
  return (
    <DemoDialog
      title={draft.id ? 'Editar expediente' : 'Cadastrar expediente'}
      eyebrow="JORNADA VERSIONADA"
      description="Alterar horários cria uma nova versão para os períodos futuros, sem reescrever o passado."
      pending={busy}
      confirmLabel={busy ? 'Salvando…' : 'Salvar expediente'}
      onCancel={onCancel}
      onConfirm={() => {
        void save();
        return false;
      }}
    >
      <div className="space-y-5">
        <label className="form-label">
          Nome do expediente
          <input
            className="field"
            maxLength={120}
            value={draft.name}
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="form-label">
          Fuso horário
          <input
            className="field"
            maxLength={64}
            value={draft.timezone}
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
          />
        </label>
        <label className="flex gap-3 items-center">
          <input
            type="checkbox"
            checked={draft.isActive}
            disabled={busy}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
          />
          Expediente ativo
        </label>
        <p className="info-note">
          Cadastre somente os intervalos trabalhados. Almoço e pausas ficam
          entre os períodos. Para virar a meia-noite, divida em dois dias; 00:00
          na saída representa o fim do dia.
        </p>
        {days.map((day, index) => (
          <fieldset
            className="rounded-xl border border-slate-200 p-3 space-y-3"
            key={day}
            disabled={busy}
          >
            <legend className="px-1 font-semibold text-sm">{day}</legend>
            {!draft.weekly.some((w) => w.day === index) && (
              <p className="text-xs text-slate-500">Sem expediente.</p>
            )}
            {draft.weekly.map((period, i) =>
              period.day !== index ? null : (
                <div className="flex flex-wrap items-end gap-2" key={i}>
                  <label className="form-label flex-1 min-w-0">
                    Entrada {day}
                    <input
                      className="field"
                      type="time"
                      value={time(period.startMinute)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          weekly: draft.weekly.map((w, j) =>
                            j === i
                              ? {
                                  ...w,
                                  startMinute: minute(e.target.value),
                                }
                              : w,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="form-label flex-1 min-w-0">
                    Saída {day}
                    <input
                      className="field"
                      type="time"
                      value={time(period.endMinute)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          weekly: draft.weekly.map((w, j) =>
                            j === i
                              ? {
                                  ...w,
                                  endMinute: minute(e.target.value, true),
                                }
                              : w,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        weekly: draft.weekly.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remover período
                  </button>
                </div>
              ),
            )}
            <button
              className="text-button"
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  weekly: [
                    ...draft.weekly,
                    { day: index, startMinute: 480, endMinute: 720 },
                  ],
                })
              }
            >
              Adicionar período em {day.toLowerCase()}
            </button>
          </fieldset>
        ))}
        <fieldset className="space-y-4" disabled={busy}>
          <legend className="font-semibold">Datas de exceção</legend>
          <p className="text-xs text-slate-500">
            Dias sem expediente ou com horários específicos. Não há importação
            automática de feriados.
          </p>
          {draft.exceptions.map((ex, i) => (
            <div
              className="space-y-3 rounded-xl border border-slate-200 p-3"
              key={i}
            >
              <label className="form-label">
                Data da exceção
                <input
                  type="date"
                  className="field"
                  value={ex.date}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      exceptions: draft.exceptions.map((x, j) =>
                        i === j ? { ...x, date: e.target.value } : x,
                      ),
                    })
                  }
                />
              </label>
              <label className="flex gap-3 items-center">
                <input
                  type="checkbox"
                  checked={!ex.intervals.length}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      exceptions: draft.exceptions.map((x, j) =>
                        i === j
                          ? {
                              ...x,
                              intervals: e.target.checked
                                ? []
                                : [{ startMinute: 480, endMinute: 720 }],
                            }
                          : x,
                      ),
                    })
                  }
                />
                Dia sem expediente
              </label>
              {ex.intervals.map((v, k) => (
                <div className="flex flex-wrap gap-2" key={k}>
                  <label className="form-label flex-1 min-w-0">
                    Entrada da exceção
                    <input
                      className="field"
                      type="time"
                      value={time(v.startMinute)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          exceptions: draft.exceptions.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  intervals: x.intervals.map((n, m) =>
                                    m === k
                                      ? {
                                          ...n,
                                          startMinute: minute(e.target.value),
                                        }
                                      : n,
                                  ),
                                }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="form-label flex-1 min-w-0">
                    Saída da exceção
                    <input
                      className="field"
                      type="time"
                      value={time(v.endMinute)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          exceptions: draft.exceptions.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  intervals: x.intervals.map((n, m) =>
                                    m === k
                                      ? {
                                          ...n,
                                          endMinute: minute(
                                            e.target.value,
                                            true,
                                          ),
                                        }
                                      : n,
                                  ),
                                }
                              : x,
                          ),
                        })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        exceptions: draft.exceptions.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                intervals: x.intervals.filter(
                                  (_, m) => m !== k,
                                ),
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    Remover intervalo
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      exceptions: draft.exceptions.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              intervals: [
                                ...x.intervals,
                                { startMinute: 780, endMinute: 1080 },
                              ],
                            }
                          : x,
                      ),
                    })
                  }
                >
                  Adicionar intervalo da exceção
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      exceptions: draft.exceptions.filter((_, j) => i !== j),
                    })
                  }
                >
                  Remover exceção
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="button-secondary"
            onClick={() =>
              setDraft({
                ...draft,
                exceptions: [...draft.exceptions, { date: '', intervals: [] }],
              })
            }
          >
            Adicionar data de exceção
          </button>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    </DemoDialog>
  );
}
