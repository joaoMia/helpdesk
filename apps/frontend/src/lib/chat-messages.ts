import type { Conversation } from '@helpdesk/contracts';
type ChatComment = Conversation['comments'][number];
export function mergeMessages(messages: ChatComment[]) {
  return [...new Map(messages.map((m) => [m.id, m])).values()].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
export function chatWritable(status: string) {
  return ['OPEN', 'IN_PROGRESS', 'PENDING'].includes(status);
}
