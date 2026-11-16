import { z } from 'zod';
import { metrics } from './lifecycle.repository.js';
import { finishSla, autoResumeRequester } from '../calendars/sla-clock.js';
import {
  commentInputSchema,
  solutionInputSchema,
  conversationQuerySchema,
  conversationSchema,
  attachmentSchema,
} from '@helpdesk/contracts';
import type { Identity } from '../auth/auth.service.js';
import {
  requirePermission,
  resourceNotFound,
} from '../authorization/permissions.js';
import { ApplicationError, databaseErrorCode } from '../../shared/errors.js';
import {
  ConversationRepository,
  fileDto,
  fileSelect,
} from './conversation.repository.js';
import {
  AttachmentStorage,
  validateAttachment,
  attachmentLimits,
} from './attachment-storage.js';
function parse<T>(schema: z.ZodType<T>, input: unknown) {
  const r = schema.safeParse(input);
  if (!r.success)
    throw new ApplicationError(
      'INVALID_INPUT',
      400,
      'Revise os campos permitidos.',
    );
  return r.data;
}
function id(input: unknown) {
  const r = z.uuid().safeParse(input);
  if (!r.success) throw resourceNotFound();
  return r.data;
}
export class ConversationService {
  constructor(
    private repo: ConversationRepository,
    readonly storage = new AttachmentStorage(),
    readonly limits = attachmentLimits,
  ) {}
  private async mutate<T>(op: () => Promise<T>) {
    try {
      return await op();
    } catch (e) {
      if (
        (e as { code?: string }).code === 'P2034' ||
        ['40001', '40P01', '23505'].includes(databaseErrorCode(e) ?? '')
      )
        throw new ApplicationError(
          'TICKET_CONFLICT',
          409,
          'O chamado foi alterado por outra operação. Atualize antes de tentar novamente.',
        );
      throw e;
    }
  }
  async revision(identity: Identity, ticketId: unknown) {
    requirePermission(identity, 'tickets.read');
    return this.repo.revision(identity, id(ticketId));
  }
  async discard(identity: Identity, ticketId: unknown, fileId: unknown) {
    requirePermission(identity, 'tickets.comment');
    const file = await this.repo.write(
      identity,
      id(ticketId),
      'discard',
      async (tx) => {
        const f = await tx.ticketAttachment.findFirst({
          where: {
            id: id(fileId),
            ticketId: id(ticketId),
            uploaderId: identity.user.id,
            isDraft: true,
            commentId: null,
            solutionId: null,
          },
        });
        if (!f) throw resourceNotFound();
        await tx.ticketAttachment.delete({ where: { id: f.id } });
        return f;
      },
    );
    await this.storage.removeOwn(file.storageKey).catch(() => {
      /* Private orphan reconciliation can retry. */
    });
  }
  async read(identity: Identity, ticketId: unknown, query: unknown) {
    requirePermission(identity, 'tickets.read');
    const q = parse(conversationQuerySchema, query);
    return conversationSchema.parse(
      await this.repo.read(identity, id(ticketId), q.page, q.pageSize),
    );
  }
  async comment(identity: Identity, ticketId: unknown, input: unknown) {
    requirePermission(identity, 'tickets.comment');
    const v = parse(commentInputSchema, input);
    return this.mutate(() =>
      this.repo.write(identity, id(ticketId), 'comment', async (tx, t, now) => {
        if (v.clientMessageId) {
          const previous = await tx.ticketEvent.findFirst({
            where: {
              ticketId: t.id,
              actorId: identity.user.id,
              eventType: 'COMMENT_ADDED',
              newValue: {
                path: ['clientMessageId'],
                equals: v.clientMessageId,
              },
            },
            select: { newValue: true },
          });
          if (previous) {
            const commentId = (previous.newValue as { commentId: string })
              .commentId;
            const previousComment = await tx.ticketComment.findUniqueOrThrow({
              where: { id: commentId },
              include: { attachments: { select: { id: true } } },
            });
            if (
              previousComment.content !== v.content ||
              JSON.stringify(
                previousComment.attachments.map((f) => f.id).sort(),
              ) !== JSON.stringify([...v.attachmentIds].sort())
            )
              throw new ApplicationError(
                'MESSAGE_CONFLICT',
                409,
                'Esta mensagem já foi processada com outros dados. Confira a conversa antes de tentar novamente.',
              );
            return { id: commentId };
          }
        }
        const c = await tx.ticketComment.create({
          data: {
            ticketId: t.id,
            authorId: identity.user.id,
            content: v.content,
            createdAt: now,
          },
        });
        await this.repo.link(tx, t.id, identity.user.id, v.attachmentIds, {
          commentId: c.id,
        });
        await autoResumeRequester(tx, t.id, identity.user.id, now);
        await tx.ticketEvent.create({
          data: {
            ticketId: t.id,
            actorId: identity.user.id,
            eventType: 'COMMENT_ADDED',
            createdAt: now,
            newValue: {
              commentId: c.id,
              ...(v.clientMessageId
                ? { clientMessageId: v.clientMessageId }
                : {}),
            },
          },
        });
        return { id: c.id };
      }),
    );
  }
  async solve(identity: Identity, ticketId: unknown, input: unknown) {
    requirePermission(identity, 'tickets.solve');
    const v = parse(solutionInputSchema, input);
    return this.mutate(() =>
      this.repo.write(
        identity,
        id(ticketId),
        'solution',
        async (tx, t, now) => {
          const solvedAt = v.solvedAt ? new Date(v.solvedAt) : now;
          const calendar = await tx.ticketCalendarSegment.findFirst({
              where: { ticketId: t.id },
              orderBy: { startsAt: 'desc' },
            }),
            sla = await tx.ticketSlaRevision.findFirst({
              where: { ticketId: t.id, endedAt: null },
              orderBy: { createdAt: 'desc' },
            }),
            pending = await tx.ticketPendingPeriod.findFirst({
              where: { ticketId: t.id },
              orderBy: { startsAt: 'desc' },
            });
          const earliest = Math.max(
            t.createdAt.getTime(),
            t.firstStartedAt?.getTime() ?? 0,
            t.classifiedAt?.getTime() ?? 0,
            calendar?.startsAt.getTime() ?? 0,
            sla?.startedAt?.getTime() ?? 0,
            pending?.endsAt?.getTime() ?? 0,
          );
          if (
            solvedAt.getTime() > now.getTime() ||
            solvedAt.getTime() < earliest
          )
            throw new ApplicationError(
              'INVALID_SOLUTION_DATE',
              400,
              'A data da solução deve estar entre a última mudança operacional do atendimento e o momento atual.',
            );
          const s = await tx.ticketSolution.create({
            data: {
              ticketId: t.id,
              authorId: identity.user.id,
              description: v.description,
              createdAt: now,
            },
          });
          await this.repo.link(tx, t.id, identity.user.id, v.attachmentIds, {
            solutionId: s.id,
          });
          await tx.ticket.update({
            where: { id: t.id },
            data: { status: 'RESOLVED', resolvedAt: solvedAt },
          });
          await finishSla(tx, t.id, solvedAt, 'SOLUTION');
          const solutionMetrics = await metrics(tx, t, solvedAt);
          await tx.ticketEvent.create({
            data: {
              ticketId: t.id,
              actorId: identity.user.id,
              eventType: 'SOLUTION_ADDED',
              createdAt: now,
              oldValue: { status: t.status },
              newValue: {
                status: 'RESOLVED',
                solutionId: s.id,
                solutionMetrics,
                solvedAt: solvedAt.toISOString(),
                recordedAt: now.toISOString(),
              },
            },
          });
          return { id: s.id, resolvedAt: solvedAt.toISOString() };
        },
      ),
    );
  }
  async upload(
    identity: Identity,
    ticketId: unknown,
    name: unknown,
    input: unknown,
    draft = false,
  ) {
    requirePermission(identity, 'tickets.comment');
    const tid = id(ticketId);
    await this.repo.accessible(identity, tid);
    if (!Buffer.isBuffer(input))
      throw new ApplicationError(
        'INVALID_FILE',
        400,
        'Envie um arquivo binário válido.',
      );
    const safe = await validateAttachment(name, input, this.limits.bytes),
      stored = await this.storage.put(safe.bytes);
    try {
      return await this.mutate(() =>
        this.repo.write(identity, tid, 'attachment', async (tx, t, now) => {
          if (
            (await tx.ticketAttachment.count({ where: { ticketId: t.id } })) >=
            this.limits.count
          )
            throw new ApplicationError(
              'FILE_LIMIT',
              409,
              'O limite de anexos deste chamado foi atingido.',
            );
          const f = await tx.ticketAttachment.create({
            data: {
              ticketId: t.id,
              isDraft: draft,
              uploaderId: identity.user.id,
              name: safe.name,
              mime: safe.mime,
              size: safe.bytes.length,
              sha256: stored.sha256,
              storageKey: stored.key,
              createdAt: now,
            },
            select: fileSelect,
          });
          if (!draft)
            await autoResumeRequester(tx, t.id, identity.user.id, now);
          if (!draft)
            await tx.ticketEvent.create({
              data: {
                ticketId: t.id,
                actorId: identity.user.id,
                eventType: 'ATTACHMENT_ADDED',
                createdAt: now,
                newValue: { attachmentId: f.id },
              },
            });
          return attachmentSchema.parse(fileDto(f));
        }),
      );
    } catch (e) {
      await this.storage.removeOwn(stored.key).catch(() => {
        /* Protected orphan cleaner handles a failed unlink. */
      });
      throw e;
    }
  }
  async download(identity: Identity, ticketId: unknown, fileId: unknown) {
    requirePermission(identity, 'tickets.read');
    const f = await this.repo.download(identity, id(ticketId), id(fileId));
    try {
      return { file: f, bytes: await this.storage.get(f.storageKey, f.sha256) };
    } catch {
      throw new ApplicationError(
        'FILE_UNAVAILABLE',
        503,
        'O arquivo não está disponível. Contate o suporte.',
      );
    }
  }
}
