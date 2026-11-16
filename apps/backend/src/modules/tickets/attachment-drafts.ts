import type { PrismaClient } from '../../generated/prisma/client.js';
import type { AttachmentStorage } from './attachment-storage.js';

// Called by the existing guarded maintenance command, never by a public route.
// Lock only expired unlinked drafts; historical/confirmed attachments are excluded.
export async function cleanExpiredDrafts(
  db: PrismaClient,
  storage: AttachmentStorage,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - 86400000);
  const rows = await db.$transaction(async (tx) => {
    const opening = await tx.$queryRaw<
      { id: string; storageKey: string }[]
    >`SELECT id,storage_key AS "storageKey" FROM opening_uploads WHERE expires_at < ${now} FOR UPDATE SKIP LOCKED`;
    if (opening.length)
      await tx.openingUpload.deleteMany({
        where: { id: { in: opening.map((f) => f.id) }, expiresAt: { lt: now } },
      });
    const selected = await tx.$queryRaw<
      { id: string; storageKey: string }[]
    >`SELECT id,storage_key AS "storageKey" FROM ticket_attachments WHERE is_draft=true AND comment_id IS NULL AND solution_id IS NULL AND created_at < ${cutoff} FOR UPDATE SKIP LOCKED`;
    if (selected.length)
      await tx.ticketAttachment.deleteMany({
        where: {
          id: { in: selected.map((f) => f.id) },
          isDraft: true,
          commentId: null,
          solutionId: null,
          createdAt: { lt: cutoff },
        },
      });
    return [...selected, ...opening];
  });
  for (const row of rows)
    await storage.removeOwn(row.storageKey).catch(() => {
      /* Unreferenced physical orphan remains private for the normal reconciler. */
    });
  return rows.length;
}
