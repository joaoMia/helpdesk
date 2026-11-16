import { loadEnvironment } from '../src/config/env.js';
import { developmentMigrationTarget } from '../src/database/test-target.js';
import { createDatabase } from '../src/database/client.js';
import { AttachmentStorage } from '../src/modules/tickets/attachment-storage.js';
import { ProjectFileRepository } from '../src/modules/projects/project-file.repository.js';
import { ProjectConversationRepository } from '../src/modules/projects/project-conversation.repository.js';
async function run() {
  const args = process.argv.slice(2);
  if (args.some((a) => a !== '--apply'))
    throw Error('Argumento não permitido.');
  const env = loadEnvironment(),
    target = developmentMigrationTarget(env, env.NODE_ENV),
    db = createDatabase(target.connectionString);
  try {
    const actual = await db.$queryRaw<
      { name: string; schema: string }[]
    >`SELECT current_database() name,current_schema() schema`;
    if (actual[0]?.name !== 'helpdesk_dev' || actual[0]?.schema !== 'public')
      throw Error('Destino incorreto.');
    if (!args.includes('--apply')) {
      const expired =
        await db.$queryRaw`SELECT (SELECT count(*) FROM project_attachments WHERE project_id IS NULL AND expires_at<CURRENT_TIMESTAMP)+(SELECT count(*) FROM project_conversation_attachments WHERE message_id IS NULL AND expires_at<CURRENT_TIMESTAMP) AS count`;
      console.log({ database: target.database, apply: false, expired });
      return;
    }
    const storage = new AttachmentStorage(undefined, 'projects'),
      formFiles = await new ProjectFileRepository(db).cleanExpired(storage),
      messages = await new ProjectConversationRepository(db).cleanExpired(
        storage,
      );
    console.log({ database: target.database, formFiles, messages });
  } finally {
    await db.$disconnect();
  }
}
run().catch(() => {
  console.error(
    'Limpeza de anexos de Projetos não confirmada; detalhes privados omitidos.',
  );
  process.exitCode = 1;
});
