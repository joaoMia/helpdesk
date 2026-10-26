import type { DemoTicket } from '../types/demo';
export interface CompletionCorrection {
  id: string;
  originalRecordedAt: string;
  originalEffectiveAt: string;
  requestedEffectiveAt: string;
  requestedAt: string;
  requestedBy: string;
  justification: string;
  stage: 'REQUESTED_PREVIEW';
}
export function localDateInput(instant: string) {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function localToInstant(value: string) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}
export function validateEffectiveDate(
  ticket: DemoTicket,
  value: string,
  justification: string,
  recordedAt: string,
  correction = false,
) {
  const effective = Date.parse(value),
    recorded = Date.parse(recordedAt),
    started = Date.parse(ticket.firstStartedAt ?? '');
  if (!Number.isFinite(effective) || !Number.isFinite(started))
    return 'Informe uma data válida; o início efetivo do atendimento precisa estar registrado.';
  if (effective > recorded)
    return 'A conclusão efetiva não pode estar no futuro.';
  if (effective < started)
    return 'A conclusão efetiva não pode ser anterior ao primeiro início do atendimento.';
  if ((correction || effective !== recorded) && !justification.trim())
    return 'Informe a justificativa da data efetiva ou da correção solicitada.';
  if (
    correction &&
    effective ===
      Date.parse(ticket.effectiveCompletedAt ?? ticket.closedAt ?? '')
  )
    return 'Informe uma data solicitada diferente da conclusão original.';
  return '';
}
