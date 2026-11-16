import type { Priority, Status } from '../types/demo';

export const statusLabels: Record<Status, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em atendimento',
  PENDING: 'Pendente',
  CLOSED: 'Encerrado',
};
export const priorityLabels: Record<Priority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
};
export function ticketEventLabel(type: string) {
  const labels: Record<string, string> = {
    OPENED: 'Chamado aberto.',
    PRIORITY_CLASSIFIED: 'Prioridade classificada.',
    ASSIGNED: 'Responsável atribuído.',
    ATTENDANCE_STARTED: 'Atendimento iniciado.',
    COMMENT_ADDED: 'Comentário adicionado à conversa.',
    ATTACHMENT_ADDED: 'Arquivo anexado ao chamado.',
    SOLUTION_ADDED:
      'Solução registrada. O encerramento definitivo é uma etapa separada.',
    PENDING_STARTED:
      'Atendimento colocado em pendência com motivo e justificativa.',
    PENDING_RESUMED: 'Atendimento retomado pelo técnico responsável.',
    PENDING_AUTO_RESUMED:
      'Atendimento retomado após interação confirmada do solicitante, conforme a regra histórica da pendência.',
    TICKET_CLOSED:
      'Chamado encerrado. Métricas finais e referências históricas foram congeladas.',
    CALENDAR_CHANGED:
      'Calendário aplicável atualizado para os períodos seguintes, preservando o histórico.',
  };
  return labels[type] ?? 'Atualização registrada no histórico.';
}
export function date(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
