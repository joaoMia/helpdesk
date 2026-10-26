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
export function date(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
