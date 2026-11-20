import { createHash } from 'node:crypto';
import type { PrismaClient, Prisma } from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { invalidSession } from '../auth/auth.service.js';
import { ticketScope } from '../authorization/ticket-scope.js';
import { resourceNotFound } from '../authorization/permissions.js';
import { ApplicationError } from '../../shared/errors.js';
const conflict = () =>
  new ApplicationError(
    'TICKET_CONFLICT',
    409,
    'O chamado foi alterado ou não permite esta operação. Atualize antes de tentar novamente.',
  );
export const fileSelect = {
  id: true,
  uploaderId: true,
  name: true,
  mime: true,
  size: true,
  createdAt: true,
  uploader: { select: { name: true } },
} as const;
export const fileDto = (
  f: Prisma.TicketAttachmentGetPayload<{ select: typeof fileSelect }>,
) => {
  const { uploader, ...r } = f;
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    uploaderName: uploader.name,
    previewable: r.mime === 'image/png',
  };
};
export class ConversationRepository {
  constructor(readonly db: PrismaClient) {}
  async revision(identity: Identity, id: string) {
    return this.db.$transaction(
      async (tx) => {
        const t = await tx.ticket.findFirst({
          where: { AND: [ticketScope(identity, 'tickets.read'), { id }] },
          select: { status: true, updatedAt: true },
        });
        if (!t) throw resourceNotFound();
        const count = await tx.ticketComment.count({ where: { ticketId: id } });
        const attachments = await tx.ticketAttachment.count({
          where: { ticketId: id, isDraft: false },
        });
        const solution = await tx.ticketSolution.findUnique({
          where: { ticketId: id },
          select: { id: true },
        });
        return createHash('sha256')
          .update(JSON.stringify([t, count, attachments, solution]))
          .digest('hex');
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async accessible(identity: Identity, id: string) {
    const row = await this.db.ticket.findFirst({
      where: { AND: [ticketScope(identity, 'tickets.read'), { id }] },
      select: { id: true, status: true },
    });
    if (!row) throw resourceNotFound();
    return row;
  }
  async read(identity: Identity, id: string, page: number, pageSize: number) {
    return this.db.$transaction(
      async (tx) => {
        if (
          !(await tx.ticket.findFirst({
            where: { AND: [ticketScope(identity, 'tickets.read'), { id }] },
            select: { id: true },
          }))
        )
          throw resourceNotFound();
        const rows = await tx.ticketComment.findMany({
          where: { ticketId: id },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            author: { select: { name: true } },
            attachments: { select: fileSelect },
          },
        });
        const solution = await tx.ticketSolution.findUnique({
          where: { ticketId: id },
          include: {
            author: { select: { name: true } },
            attachments: { select: fileSelect },
          },
        });
        return {
          comments: rows.map((c) => ({
            id: c.id,
            authorId: c.authorId,
            authorName: c.author.name,
            content: c.content,
            createdAt: c.createdAt.toISOString(),
            attachments: c.attachments.map(fileDto),
          })),
          total: await tx.ticketComment.count({ where: { ticketId: id } }),
          page,
          pageSize,
          attachments: (
            await tx.ticketAttachment.findMany({
              where: {
                ticketId: id,
                commentId: null,
                solutionId: null,
                isDraft: false,
              },
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: fileSelect,
            })
          ).map(fileDto),
          solution: solution
            ? {
                id: solution.id,
                description: solution.description,
                authorName: solution.author.name,
                createdAt: solution.createdAt.toISOString(),
                attachments: solution.attachments.map(fileDto),
              }
            : null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async write<T>(
    identity: Identity,
    id: string,
    operation: 'comment' | 'solution' | 'attachment' | 'discard',
    fn: (
      tx: Prisma.TransactionClient,
      ticket: Prisma.TicketGetPayload<object>,
      now: Date,
    ) => Promise<T>,
  ) {
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id=${identity.user.id}::uuid FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM auth_sessions WHERE id=${identity.sessionId}::uuid FOR UPDATE`;
        const user = await tx.user.findUnique({
            where: { id: identity.user.id },
          }),
          session = await tx.authSession.findUnique({
            where: { id: identity.sessionId },
          });
        if (
          !user ||
          !user.isActive ||
          user.mustChangePassword ||
          user.role !== identity.user.role ||
          !session ||
          session.userId !== user.id ||
          session.revokedAt ||
          session.expiresAt <= new Date()
        )
          throw invalidSession();
        await tx.$queryRaw`SELECT id FROM tickets WHERE id=${id}::uuid FOR UPDATE`;
        const ticket = await tx.ticket.findFirst({
          where: { AND: [ticketScope(identity, 'tickets.read'), { id }] },
        });
        if (!ticket) throw resourceNotFound();
        if (
          operation !== 'discard' &&
          ['CLOSED', 'RESOLVED'].includes(ticket.status)
        )
          throw conflict();
        if (
          operation === 'solution' &&
          (user.role !== 'TECHNICIAN' ||
            ticket.assignedTechnicianId !== user.id ||
            ticket.status !== 'IN_PROGRESS')
        )
          throw conflict();
        return fn(tx, ticket, new Date());
      },
      { isolationLevel: 'Serializable', timeout: 15000 },
    );
  }
  async link(
    tx: Prisma.TransactionClient,
    ticketId: string,
    userId: string,
    ids: string[],
    target: { commentId: string } | { solutionId: string },
  ) {
    if (!ids.length) return;
    const r = await tx.ticketAttachment.updateMany({
      where: {
        id: { in: ids },
        ticketId,
        uploaderId: userId,
        commentId: null,
        solutionId: null,
      },
      data: { ...target, isDraft: false },
    });
    if (r.count !== ids.length)
      throw new ApplicationError(
        'ATTACHMENT_UNAVAILABLE',
        409,
        'Um ou mais anexos já foram usados ou não estão disponíveis para este chamado. Selecione os arquivos novamente.',
      );
  }
  async download(identity: Identity, ticketId: string, id: string) {
    const row = await this.db.ticketAttachment.findFirst({
      where: {
        id,
        ticketId,
        OR: [{ isDraft: false }, { uploaderId: identity.user.id }],
        ticket: { is: ticketScope(identity, 'tickets.read') },
      },
      select: { ...fileSelect, storageKey: true, sha256: true },
    });
    if (!row) throw resourceNotFound();
    return row;
  }
}
