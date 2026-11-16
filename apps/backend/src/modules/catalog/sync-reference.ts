import type { PrismaClient } from '../../generated/prisma/client.js';
import reference from './reference-catalog.json' with { type: 'json' };

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
const action = 'CATALOG_REFERENCE_V1';
export async function syncReferenceCatalog(db: PrismaClient, apply = false) {
  return db.$transaction(
    async (tx) => {
      // Serialize this local synchronization with all catalog writes, without
      // changing any preexisting record, ID, activation flag or form version.
      await tx.$executeRaw`LOCK TABLE service_categories, services IN SHARE ROW EXCLUSIVE MODE`;
      const categories = await tx.serviceCategory.findMany(),
        services = await tx.service.findMany();
      const mappings = await tx.adminAuditEvent.findMany({
        where: { action },
        select: { resourceType: true, resourceId: true, details: true },
      });
      const result: {
        kind: string;
        key: string;
        name: string;
        state: 'existing' | 'create' | 'ignored';
        reason?: string;
      }[] = [];
      const resolved = new Map<string, string>();
      async function remember(kind: string, key: string, id: string) {
        if (
          apply &&
          !mappings.some(
            (m) =>
              m.resourceType === kind &&
              (m.details as { referenceKey?: string }).referenceKey === key,
          )
        )
          await tx.adminAuditEvent.create({
            data: {
              resourceType: kind,
              resourceId: id,
              action,
              details: {
                referenceKey: key,
                source: 'initialCatalog-v1',
                environment: 'development',
              },
            },
          });
      }
      for (const c of reference.categories) {
        const map = mappings.filter(
          (m) =>
            m.resourceType === 'category' &&
            (m.details as { referenceKey?: string }).referenceKey === c.key,
        );
        const matches = map.length
          ? categories.filter((r) => map.some((m) => m.resourceId === r.id))
          : categories.filter((r) => normalize(r.name) === normalize(c.name));
        if (
          matches.length > 1 ||
          map.length > 1 ||
          (map.length && !matches.length)
        ) {
          result.push({
            kind: 'category',
            key: c.key,
            name: c.name,
            state: 'ignored',
            reason:
              'Correspondência ambígua ou referência ausente; preservado.',
          });
          continue;
        }
        if (matches[0]) {
          resolved.set(c.key, matches[0].id);
          await remember('category', c.key, matches[0].id);
          result.push({
            kind: 'category',
            key: c.key,
            name: c.name,
            state: 'existing',
          });
          continue;
        }
        const { key, ...data } = c;
        if (apply) {
          const row = await tx.serviceCategory.create({ data });
          resolved.set(key, row.id);
          await remember('category', key, row.id);
        } else resolved.set(key, 'planned:' + key);
        result.push({ kind: 'category', key, name: c.name, state: 'create' });
      }
      for (const s of reference.services) {
        const categoryId = resolved.get(s.categoryKey);
        if (!categoryId) {
          result.push({
            kind: 'service',
            key: s.key,
            name: s.name,
            state: 'ignored',
            reason: 'Categoria sem correspondência segura.',
          });
          continue;
        }
        const map = mappings.filter(
          (m) =>
            m.resourceType === 'service' &&
            (m.details as { referenceKey?: string }).referenceKey === s.key,
        );
        const matches = map.length
          ? services.filter((r) => map.some((m) => m.resourceId === r.id))
          : services.filter((r) => normalize(r.name) === normalize(s.name));
        if (
          matches.length > 1 ||
          map.length > 1 ||
          (map.length && !matches.length) ||
          (matches[0] && matches[0].categoryId !== categoryId)
        ) {
          result.push({
            kind: 'service',
            key: s.key,
            name: s.name,
            state: 'ignored',
            reason:
              'Correspondência ou categoria conflitante; registro preservado.',
          });
          continue;
        }
        if (matches[0]) {
          await remember('service', s.key, matches[0].id);
          result.push({
            kind: 'service',
            key: s.key,
            name: s.name,
            state: 'existing',
          });
          continue;
        }
        const { key, name, description, isActive, displayOrder } = s;
        const data = { name, description, isActive, displayOrder };
        if (apply) {
          const row = await tx.service.create({
            data: { ...data, categoryId, forms: { create: { version: 1 } } },
          });
          await remember('service', key, row.id);
        }
        result.push({ kind: 'service', key, name: s.name, state: 'create' });
      }
      return {
        apply,
        items: result,
        existing: result.filter((r) => r.state === 'existing').length,
        created: result.filter((r) => r.state === 'create').length,
        ignored: result.filter((r) => r.state === 'ignored').length,
      };
    },
    { isolationLevel: 'Serializable', timeout: 30000 },
  );
}
