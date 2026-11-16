import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { editableFormSchema } from '@helpdesk/contracts';
import reference from './reference-forms.json' with { type: 'json' };
const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

// Called only by the guarded development synchronizer. Never replaces an edited form.
export async function syncReferenceForms(db: PrismaClient, apply = false) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`LOCK TABLE service_categories, services IN SHARE ROW EXCLUSIVE MODE`;
      const services = await tx.service.findMany({
        include: {
          category: true,
          retirement: true,
          forms: {
            orderBy: { version: 'desc' },
            take: 1,
            include: { fields: true },
          },
          formDraft: true,
        },
      });
      const items: {
        name: string;
        state: 'create' | 'existing' | 'ignored';
        reason?: string;
      }[] = [];
      for (const r of reference) {
        const matches = services.filter(
          (s) =>
            normalize(s.name) === normalize(r.name) &&
            normalize(s.category.name) === normalize(r.category),
        );
        if (matches.length !== 1) {
          items.push({
            name: r.name,
            state: 'ignored',
            reason: 'Correspondência ausente ou ambígua',
          });
          continue;
        }
        const s = matches[0]!,
          form = s.forms[0];
        const already = await tx.adminAuditEvent.findFirst({
          where: { resourceId: s.id, action: 'FORM_REFERENCE_V1' },
        });
        if (already) {
          items.push({ name: r.name, state: 'existing' });
          continue;
        }
        const categoryRetired = await tx.operationalRetirement.findUnique({
          where: { categoryId: s.categoryId },
        });
        if (
          s.retirement ||
          categoryRetired ||
          s.formDraft ||
          !form ||
          form.version !== 1 ||
          form.fields.length ||
          form.title ||
          form.description
        ) {
          items.push({
            name: r.name,
            state: 'ignored',
            reason: 'Configuração existente preservada',
          });
          continue;
        }
        const definition = editableFormSchema.parse(r.definition);
        if (
          definition.fields.some((f) =>
            /senha|password|secret|token/i.test(f.key + ' ' + f.label),
          )
        )
          throw Error('Definição não autorizada');
        if (apply) {
          await tx.serviceFormVersion.create({
            data: {
              serviceId: s.id,
              version: 2,
              title: definition.title,
              description: definition.description,
              fields: {
                create: definition.fields.map((f, index) => ({
                  id: randomUUID(),
                  key: f.key,
                  label: f.label,
                  type: f.type,
                  required: f.required,
                  displayOrder: index,
                  help: f.help,
                  description: f.description,
                  ...(f.options ? { options: f.options } : {}),
                  ...(f.condition ? { condition: f.condition } : {}),
                })),
              },
            },
          });
          await tx.adminAuditEvent.create({
            data: {
              resourceType: 'service',
              resourceId: s.id,
              action: 'FORM_REFERENCE_V1',
              details: {
                source: 'authorized-development-sync',
                fieldCount: definition.fields.length,
                version: 2,
              },
            },
          });
        }
        items.push({ name: r.name, state: 'create' });
      }
      return {
        apply,
        items,
        created: items.filter((i) => i.state === 'create').length,
        existing: items.filter((i) => i.state === 'existing').length,
        ignored: items.filter((i) => i.state === 'ignored').length,
      };
    },
    { isolationLevel: 'Serializable', timeout: 30000 },
  );
}

// Explicit later decision: one system per user-creation request. Change only
// this field, create a new version and preserve all other administrator edits.
export async function syncSingleSystemForm(db: PrismaClient, apply = false) {
  return db.$transaction(
    async (tx) => {
      const candidates = (
        await tx.service.findMany({
          where: {
            retirement: { is: null },
            category: { retirement: { is: null } },
          },
          include: { category: true },
        })
      ).filter(
        (s) =>
          normalize(s.name) === 'criacao de usuario' &&
          normalize(s.category.name) === 'acessos e contas',
      );
      if (candidates.length !== 1)
        return {
          state: 'ignored',
          reason: 'Correspondência ausente ou ambígua',
        };
      const service = candidates[0]!;
      await tx.$queryRaw`SELECT id FROM services WHERE id=${service.id}::uuid FOR UPDATE`;
      const form = await tx.serviceFormVersion.findFirst({
        where: { serviceId: service.id },
        orderBy: { version: 'desc' },
        include: { fields: { orderBy: { displayOrder: 'asc' } } },
      });
      const system = form?.fields.find((f) => f.key === 'systems');
      if (!form || !system || system.type !== 'MULTI_SELECT')
        return { state: 'existing' };
      const definition = editableFormSchema.parse({
        title: form.title,
        description: form.description,
        fields: form.fields.map((f) => ({
          id: f.id,
          key: f.key,
          label: f.label,
          type: f.key === 'systems' ? 'SELECT' : f.type,
          required: f.required,
          help: f.help,
          description: f.description,
          ...(f.options ? { options: f.options } : {}),
          ...(f.condition ? { condition: f.condition } : {}),
        })),
      });
      if (apply) {
        await tx.serviceFormVersion.create({
          data: {
            serviceId: service.id,
            version: form.version + 1,
            title: definition.title,
            description: definition.description,
            fields: {
              create: definition.fields.map((f, index) => ({
                id: randomUUID(),
                key: f.key,
                label: f.label,
                type: f.type,
                required: f.required,
                displayOrder: index,
                help: f.help,
                description: f.description,
                ...(f.options ? { options: f.options } : {}),
                ...(f.condition ? { condition: f.condition } : {}),
              })),
            },
          },
        });
        const draft = await tx.serviceFormDraft.findUnique({
          where: { serviceId: service.id },
        });
        if (draft) {
          const d = editableFormSchema.parse(draft.definition);
          for (const field of d.fields)
            if (field.key === 'systems' && field.type === 'MULTI_SELECT')
              field.type = 'SELECT';
          await tx.serviceFormDraft.update({
            where: { serviceId: service.id },
            data: {
              definition: d,
              revision: draft.revision + 1,
              ...(draft.revision === draft.publishedRevision
                ? { publishedRevision: draft.revision + 1 }
                : {}),
            },
          });
        }
        await tx.adminAuditEvent.create({
          data: {
            resourceType: 'service',
            resourceId: service.id,
            action: 'FORM_SINGLE_SYSTEM_V1',
            details: {
              source: 'explicit-owner-decision',
              previousVersion: form.version,
              version: form.version + 1,
              field: 'systems',
            },
          },
        });
      }
      return { state: 'create', version: form.version + 1, apply };
    },
    { isolationLevel: 'Serializable' },
  );
}
