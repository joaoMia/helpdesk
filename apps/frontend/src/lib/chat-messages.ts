import type {
  Attachment,
  Conversation,
  TicketDetail,
} from '@helpdesk/contracts';
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

export function projectTicketOpening(
  ticket: Pick<
    TicketDetail,
    'requesterId' | 'createdAt' | 'serviceSnapshot' | 'answers'
  >,
  conversation: Conversation,
) {
  const fileKeys = new Set(
    ticket.serviceSnapshot.fields
      .filter((field) => field.type === 'FILE')
      .map((field) => field.key),
  );
  const openingIds = new Set(
    ticket.answers.flatMap(({ fieldKey, value }) =>
      fileKeys.has(fieldKey) && Array.isArray(value) ? value : [],
    ),
  );
  const openingAttachments = new Map<string, Attachment>();
  const previousAttachments = conversation.attachments.filter((file) => {
    if (!openingIds.has(file.id)) return true;
    openingAttachments.set(file.id, file);
    return false;
  });
  // Fold only the persisted opening record together with its form attachments.
  // A regular message with the same text remains in the conversation.
  const comments = conversation.comments.filter((message) => {
    const openingRecord =
      message.authorId === ticket.requesterId &&
      Date.parse(message.createdAt) === Date.parse(ticket.createdAt) &&
      message.content === 'Anexos enviados na abertura do chamado.' &&
      message.attachments.length > 0 &&
      message.attachments.every((file) => openingIds.has(file.id));
    if (!openingRecord) return true;
    for (const file of message.attachments)
      openingAttachments.set(file.id, file);
    return false;
  });
  return {
    comments,
    previousAttachments,
    openingAttachments: [...openingAttachments.values()],
  };
}
