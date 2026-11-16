import { Prisma } from '../generated/prisma/client.js';

// PostgreSQL built-ins only: no extension, migration or user-controlled SQL.
// Covers Portuguese accents; literal %, _ and backslash never become wildcards.
export function containsText(column: Prisma.Sql, text: string) {
  const normalized = text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const pattern = '%' + normalized.replace(/[\\%_]/g, '\\$&') + '%';
  return Prisma.sql`translate(lower(${column}), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') LIKE ${pattern}`;
}
