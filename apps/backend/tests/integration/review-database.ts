import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import pg from 'pg';
import { expect } from '@jest/globals';
import { loadEnvironment } from '../../src/config/env.js';
import { isolatedTestTarget } from '../../src/database/test-target.js';
import { createDatabase } from '../../src/database/client.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { prismaTicketUnit } from '../../src/modules/tickets/prisma-ticket.repository.js';
import { TicketService } from '../../src/modules/tickets/ticket.service.js';
import { databaseErrorCode } from '../../src/shared/errors.js';

const config = loadEnvironment();
const target = isolatedTestTarget(config, process.env.NODE_ENV);
let ddl: string[];
export function prepareReviewSql() {
  const directory = new URL('../../prisma/migrations/', import.meta.url);
  ddl = readdirSync(directory)
    .filter((name) => /^\d{14}_[a-z0-9_]+$/.test(name))
    .sort()
    .flatMap((name) =>
      readFileSync(new URL(`${name}/migration.sql`, directory), 'utf8')
        .split(/^-- statement-breakpoint\s*$/m)
        .map((statement) => statement.trim())
        // The test's outer transaction owns rollback. Never commit test DDL/data.
        .filter((statement) => {
          const command = statement.replace(/--[^\n]*/g, '').trim();
          return command && !/^(BEGIN|COMMIT);$/i.test(command);
        }),
    );
  if (!ddl.length) throw new Error('Migration canônica não encontrada.');
}
export async function developmentFingerprint() {
  const client = new pg.Client({
    connectionString: config.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    options: '-c default_transaction_read_only=on',
  });
  try {
    await client.connect();
    const result = await client.query(
      "SELECT current_database() AS database, (SELECT coalesce(string_agg(c.relname || ':' || c.oid::text, ',' ORDER BY c.relname), '') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AS relations",
    );
    const identity = result.rows[0] as { database: string; relations: string };
    const tables = await client.query<{ name: string }>(
      "SELECT tablename AS name FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
    );
    const counts: Record<string, number> = {};
    for (const { name } of tables.rows) {
      const quoted = '"' + name.replaceAll('"', '""') + '"';
      counts[name] = Number(
        (await client.query(`SELECT count(*) FROM public.${quoted}`)).rows[0]
          .count,
      );
    }
    return { ...identity, counts };
  } finally {
    await client.end();
  }
}
export async function reviewTransaction(
  check: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  const schema = 'dev001_' + randomUUID().replaceAll('-', '');
  if (!/^dev001_[0-9a-f]{32}$/.test(schema))
    throw new Error('Namespace de teste inválido.');
  const db = createDatabase(target.connectionString, schema);
  const rollback = new Error('ROLLBACK_DEV001_EXPECTED');
  try {
    const identity = await db.$queryRaw<
      { database: string }[]
    >`SELECT current_database() AS database`;
    if (identity[0]?.database !== target.database)
      throw new Error(
        'Banco efetivo não corresponde ao banco de testes; execução recusada.',
      );
    try {
      await db.$transaction(
        async (tx) => {
          // All DDL and rows are rolled back, including the freshly-created schema.
          await tx.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
          await tx.$executeRawUnsafe(
            `SET LOCAL search_path TO "${schema}", pg_catalog`,
          );
          for (const statement of ddl)
            await tx.$executeRawUnsafe(
              statement.replaceAll('"public"', `"${schema}"`),
            );
          await check(tx);
          throw rollback;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 20000,
        },
      );
    } catch (error) {
      if (error !== rollback) throw error;
    }
  } finally {
    try {
      const remaining = await db.$queryRaw<
        { present: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname=${schema}) AS present`;
      expect(remaining[0]?.present).toBe(false);
    } finally {
      await db.$disconnect();
    }
  }
}
export async function constraintFailure(
  tx: Prisma.TransactionClient,
  operation: () => Promise<unknown>,
) {
  await tx.$executeRawUnsafe('SAVEPOINT expected_constraint');
  let failure: unknown;
  try {
    await operation();
  } catch (error) {
    failure = error;
  } finally {
    await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT expected_constraint');
    await tx.$executeRawUnsafe('RELEASE SAVEPOINT expected_constraint');
  }
  expect(failure).toBeDefined();
  const code = (failure as { code?: string }).code;
  expect(['P2002', 'P2003', 'P2004', 'P2010', 'P2039']).toContain(code);
  if (code === 'P2010' || code === 'P2039')
    expect(['23502', '23503', '23505', '23514']).toContain(
      databaseErrorCode(failure),
    );
}
export async function coreFixture(tx: Prisma.TransactionClient) {
  // Non-authenticatable fixture, scoped to this rolled-back transaction. No seed.
  const requester = await tx.user.create({
    data: {
      role: 'REQUESTER',
      name: 'Solicitante de teste',
      email: randomUUID() + '@example.invalid',
      passwordHash: 'TEST_ONLY_NOT_AN_AUTHENTICATABLE_HASH',
    },
  });
  const technician = await tx.user.create({
    data: {
      role: 'TECHNICIAN',
      name: 'Técnico de teste',
      email: randomUUID() + '@example.invalid',
      passwordHash: 'TEST_ONLY_NOT_AN_AUTHENTICATABLE_HASH',
      mustChangePassword: true,
    },
  });
  const category = await tx.serviceCategory.create({
    data: { name: 'Categoria de teste' },
  });
  const service = await tx.service.create({
    data: {
      categoryId: category.id,
      name: 'Serviço de teste',
      description: 'Descrição original',
    },
  });
  const form = await tx.serviceFormVersion.create({
    data: {
      serviceId: service.id,
      version: 1,
      fields: {
        create: {
          key: 'context',
          label: 'Contexto original',
          type: 'TEXT',
          required: true,
        },
      },
    },
    include: { fields: true },
  });
  const useCase = new TicketService({
    transaction: (operation) => operation(prismaTicketUnit(tx)),
  });
  const input = {
    serviceId: service.id,
    subject: 'Assunto',
    description: 'Descrição',
    answers: { context: 'Resposta válida' },
  };
  return { requester, technician, category, service, form, useCase, input };
}
