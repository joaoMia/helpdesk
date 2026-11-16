import { cleanExpiredDrafts } from '../src/modules/tickets/attachment-drafts.js';
import { loadEnvironment } from '../src/config/env.js';
import { developmentMigrationTarget } from '../src/database/test-target.js';
import { createDatabase } from '../src/database/client.js';
import { AttachmentStorage } from '../src/modules/tickets/attachment-storage.js';
async function run() {
  const env = loadEnvironment(),
    target = developmentMigrationTarget(env, env.NODE_ENV),
    db = createDatabase(target.connectionString);
  try {
    const storage = new AttachmentStorage();
    const expiredDrafts = await cleanExpiredDrafts(db, storage);
    const referenced = new Set(
      (
        await db.ticketAttachment.findMany({ select: { storageKey: true } })
      ).map((f) => f.storageKey),
    );
    for (const f of await db.openingUpload.findMany({
      select: { storageKey: true },
    }))
      referenced.add(f.storageKey);
    console.log({
      expiredDrafts,
      removedOldOrphans: await storage.cleanOrphans(referenced),
    });
  } finally {
    await db.$disconnect();
  }
}
run().catch(() => {
  console.error(
    'Limpeza recusada ou indisponível; detalhes privados omitidos.',
  );
  process.exitCode = 1;
});
