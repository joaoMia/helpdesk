import { readFileSync, readdirSync } from 'node:fs';

export function readTestMigrationStatements() {
  const directory = new URL('../../prisma/migrations/', import.meta.url);
  return readdirSync(directory)
    .filter((name) => /^\d{14}_[a-z0-9_]+$/.test(name))
    .sort()
    .flatMap((name) =>
      readFileSync(new URL(`${name}/migration.sql`, directory), 'utf8')
        .split(/^-- statement-breakpoint\s*$/m)
        .map((statement) => {
          // The fixtures own the transaction, including migrations that
          // wrap an entire SQL block instead of using statement breakpoints.
          return statement
            .trim()
            .replace(/^((?:\s|--[^\r\n]*)*)BEGIN\s*;/i, '$1')
            .replace(/(?:^|\r?\n)[ \t]*COMMIT\s*;\s*$/i, '')
            .trim();
        })
        .filter((statement) => statement.replace(/--[^\n]*/g, '').trim()),
    );
}
