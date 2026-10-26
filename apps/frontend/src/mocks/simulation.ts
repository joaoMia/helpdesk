import { validateEffectiveDate } from './completion';
import type { DemoAction, DemoTicket, Role } from '../types/demo';
import { roles } from './fixtures';
import { sanitizeAnswers, validateAnswers } from '../forms/service-definitions';

// Simulação descartável e síncrona, exclusivamente em memória. Não substitui
// autenticação, autorização, transações ou regras da futura API.
export function simulate(
  tickets: DemoTicket[],
  action: DemoAction,
  role: Role,
): DemoTicket[] {
  const actor = roles[role];
  const now = new Date().toISOString();
  const event = (text: string) => ({
    id: crypto.randomUUID(),
    actor: actor.name,
    text,
    at: now,
  });
  if (action.type === 'create') {
    if (
      role !== 'requester' ||
      !action.subject.trim() ||
      !action.description.trim() ||
      !action.service ||
      !action.category ||
      !action.service.active ||
      !action.category.active ||
      action.service.categoryId !== action.category.id
    )
      return tickets;
    if (
      Object.keys(
        validateAnswers(
          action.service.id,
          action.answers,
          action.service.fields,
        ),
      ).length
    )
      return tickets;
    const ticket: DemoTicket = {
      id: String(Math.max(1048, ...tickets.map((t) => Number(t.id))) + 1),
      subject: action.subject.trim(),
      description: action.description.trim(),
      requesterId: actor.id,
      status: 'OPEN',
      priority: null,
      technicianId: null,
      createdAt: now,
      service: structuredClone(action.service),
      category: structuredClone(action.category),
      answers: sanitizeAnswers(
        action.service.id,
        action.answers,
        action.service.fields,
      ),
      attachment: action.attachment,
      pending: null,
      events: [event('Chamado aberto sem prioridade e sem técnico.')],
    };
    return [ticket, ...tickets];
  }
  return tickets.map((ticket) => {
    if (ticket.id !== action.id) return ticket;
    if (action.type === 'request-completion-correction') {
      if (
        role !== 'technician' ||
        ticket.technicianId !== actor.id ||
        ticket.status !== 'CLOSED' ||
        !ticket.closedAt ||
        validateEffectiveDate(
          ticket,
          action.effectiveAt,
          action.justification,
          now,
          true,
        )
      )
        return ticket;
      return {
        ...ticket,
        completionCorrections: [
          ...(ticket.completionCorrections ?? []),
          {
            id: crypto.randomUUID(),
            originalRecordedAt: ticket.completionRecordedAt ?? ticket.closedAt,
            originalEffectiveAt: ticket.effectiveCompletedAt ?? ticket.closedAt,
            requestedEffectiveAt: action.effectiveAt,
            requestedAt: now,
            requestedBy: actor.name,
            justification: action.justification.trim(),
            stage: 'REQUESTED_PREVIEW',
          },
        ],
        events: [
          ...ticket.events,
          event(
            'Solicitada correção da data de conclusão, sem aprovação ou alteração da data original.',
          ),
        ],
      };
    }
    if (ticket.status === 'CLOSED') return ticket;
    const owns = role === 'technician' && ticket.technicianId === actor.id;
    const free =
      role === 'technician' && ticket.status === 'OPEN' && !ticket.technicianId;
    let next: DemoTicket | undefined;
    let text = '';
    if (
      action.type === 'external-totvs' &&
      owns &&
      ticket.service.id === 's3'
    ) {
      next = { ...ticket, externalTotvs: action.value.trim().slice(0, 80) };
      text =
        'Referência externa TOTVS atualizada nesta demonstração, sem alterar status.';
    } else if (action.type === 'classify' && free && !ticket.priority) {
      next = { ...ticket, priority: action.priority };
      text =
        'Prioridade classificada. O chamado continua aberto e sem técnico.';
    } else if (action.type === 'start' && free && ticket.priority) {
      next = {
        ...ticket,
        status: 'IN_PROGRESS',
        technicianId: actor.id,
        firstStartedAt: now,
      };
      text = 'Atendimento iniciado com atribuição do técnico.';
    } else if (
      action.type === 'pending' &&
      owns &&
      ticket.status === 'IN_PROGRESS' &&
      action.explanation.trim()
    ) {
      next = { ...ticket, status: 'PENDING', pending: { ...action.reason } };
      text = `Pendência: ${action.reason.name}. ${action.explanation.trim()}`;
    } else if (
      action.type === 'resume' &&
      owns &&
      ticket.status === 'PENDING'
    ) {
      next = { ...ticket, status: 'IN_PROGRESS', pending: null };
      text = 'Atendimento retomado manualmente.';
    } else if (
      action.type === 'close' &&
      owns &&
      ticket.status === 'IN_PROGRESS'
    ) {
      if (
        validateEffectiveDate(
          ticket,
          action.effectiveAt ?? now,
          action.justification ?? '',
          now,
        )
      )
        return ticket;
      next = {
        ...ticket,
        status: 'CLOSED',
        pending: null,
        closedAt: now,
        effectiveCompletedAt: action.effectiveAt ?? now,
        completionRecordedAt: now,
        completionJustification: action.justification?.trim(),
        closedBy: actor.id,
      };
      text =
        'Chamado encerrado nesta simulação. Métricas de tempo útil não calculadas.';
    } else if (
      action.type === 'comment' &&
      role === 'requester' &&
      ticket.requesterId === actor.id &&
      action.text.trim()
    ) {
      const resume = ticket.status === 'PENDING' && ticket.pending?.autoResume;
      next = {
        ...ticket,
        ...(resume ? { status: 'IN_PROGRESS' as const, pending: null } : {}),
      };
      text = `Mensagem do solicitante: ${action.text.trim()}${resume ? ' · Retomada automática simulada conforme o motivo.' : ''}`;
    }
    return next ? { ...next, events: [...ticket.events, event(text)] } : ticket;
  });
}
