import { Prisma } from '../../generated/prisma/client.js';
import type {
  PrismaClient,
  Prisma as Types,
} from '../../generated/prisma/client.js';
import type { Identity } from '../auth/auth.service.js';
import { editableFormSchema, visibleFormKeys } from '@helpdesk/contracts';
import type { EditableForm } from '@helpdesk/contracts';
import { z } from 'zod';
import {
  ProjectWorkflowRepository,
  projectConflict,
} from './project-workflow.repository.js';
import { resourceNotFound, forbidden } from '../authorization/permissions.js';
import { ApplicationError } from '../../shared/errors.js';
import { ProjectFileRepository } from './project-file.repository.js';
import type { AttachmentStorage } from '../tickets/attachment-storage.js';
import {
  initialProjectForm,
  projectCategoryReferences,
} from './project-form-reference.js';
type Tx = Types.TransactionClient;
const invalid = (message: string) =>
  new ApplicationError('INVALID_FORM', 400, message);
export class ProjectCatalogRepository {
  constructor(readonly db: PrismaClient) {}
  async list(i: Identity) {
    return this.db
      .$queryRaw`SELECT id,name,description,is_active AS "isActive",revision FROM project_categories WHERE ${i.user.role === 'ADMIN' ? Prisma.sql`TRUE` : Prisma.sql`is_active AND EXISTS(SELECT 1 FROM project_category_versions v WHERE v.category_id=project_categories.id)`} ORDER BY name,id`;
  }
  async form(i: Identity, id: string, version?: number) {
    return this.db.$transaction((tx) => this.read(tx, i, id, version), {
      isolationLevel: 'RepeatableRead',
    });
  }
  private async read(tx: Tx, i: Identity, id: string, version?: number) {
    const c = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM project_categories WHERE id=${id}::uuid AND ${i.user.role === 'ADMIN' ? Prisma.sql`TRUE` : Prisma.sql`is_active`}`;
    if (!c[0]) throw resourceNotFound();
    const rows = await tx.$queryRaw<
      {
        id: string;
        version: number;
        definition: EditableForm;
        created_at: Date;
      }[]
    >`SELECT * FROM project_category_versions WHERE category_id=${id}::uuid AND ${version ? Prisma.sql`version=${version}` : Prisma.sql`TRUE`} ORDER BY version DESC LIMIT 1`;
    const p = rows[0],
      published = p
        ? {
            id: p.id,
            version: p.version,
            createdAt: p.created_at.toISOString(),
            ...editableFormSchema.parse(p.definition),
          }
        : null;
    if (version && !p) throw resourceNotFound();
    if (i.user.role !== 'ADMIN') return { published };
    const d = (
      await tx.$queryRaw<
        {
          definition: EditableForm;
          revision: number;
          published_revision: number | null;
        }[]
      >`SELECT * FROM project_category_drafts WHERE category_id=${id}::uuid`
    )[0];
    const versions = await tx.$queryRaw<
      {
        id: string;
        version: number;
        created_at: Date;
        definition: EditableForm;
      }[]
    >`SELECT * FROM project_category_versions WHERE category_id=${id}::uuid ORDER BY version DESC`;
    return {
      published,
      draft: d
        ? {
            revision: d.revision,
            published: d.published_revision === d.revision,
            definition: d.definition,
          }
        : null,
      versions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        title: v.definition.title,
        createdAt: v.created_at.toISOString(),
      })),
    };
  }
  private async event(
    tx: Tx,
    i: Identity,
    id: string,
    kind: string,
    details: unknown,
  ) {
    await tx.$executeRaw`INSERT INTO project_catalog_events(category_id,actor_id,kind,details) VALUES(${id}::uuid,${i.user.id}::uuid,${kind},${JSON.stringify(details)}::jsonb)`;
  }
  async change(
    i: Identity,
    id: string | null,
    input: {
      name: string;
      description: string;
      isActive: boolean;
      expectedRevision?: number;
    },
  ) {
    if (i.user.role !== 'ADMIN') throw forbidden();
    return this.db.$transaction(async (tx) => {
      await new ProjectWorkflowRepository(this.db).actor(tx, i);
      if (id) {
        const n =
          await tx.$executeRaw`UPDATE project_categories SET name=${input.name},description=${input.description},is_active=${input.isActive},revision=revision+1 WHERE id=${id}::uuid AND revision=${input.expectedRevision ?? 0}`;
        if (n !== 1) throw projectConflict();
      } else {
        id = (
          await tx.$queryRaw<
            { id: string }[]
          >`INSERT INTO project_categories(name,description,is_active) VALUES(${input.name},${input.description},${input.isActive}) RETURNING id`
        )[0]!.id;
      }
      await this.event(
        tx,
        i,
        id,
        id && input.expectedRevision ? 'UPDATED' : 'CREATED',
        input,
      );
      return { id };
    });
  }
  async write(
    i: Identity,
    id: string,
    expected: number,
    definition?: EditableForm,
  ) {
    if (i.user.role !== 'ADMIN') throw forbidden();
    return this.db.$transaction(async (tx) => {
      await new ProjectWorkflowRepository(this.db).actor(tx, i);
      const c =
        await tx.$queryRaw`SELECT id FROM project_categories WHERE id=${id}::uuid FOR UPDATE`;
      if (!(c as unknown[]).length) throw resourceNotFound();
      const d = (
        await tx.$queryRaw<
          {
            definition: EditableForm;
            revision: number;
            published_revision: number | null;
          }[]
        >`SELECT * FROM project_category_drafts WHERE category_id=${id}::uuid`
      )[0];
      if ((d?.revision ?? 0) !== expected) throw projectConflict();
      if (definition) {
        await tx.$executeRaw`INSERT INTO project_category_drafts(category_id,definition,revision,actor_id,updated_at) VALUES(${id}::uuid,${JSON.stringify(definition)}::jsonb,1,${i.user.id}::uuid,${new Date()}) ON CONFLICT(category_id) DO UPDATE SET definition=EXCLUDED.definition,revision=project_category_drafts.revision+1,actor_id=EXCLUDED.actor_id,updated_at=EXCLUDED.updated_at`;
        await this.event(tx, i, id, 'DRAFT_SAVED', { revision: expected + 1 });
      } else {
        if (!d || d.published_revision === d.revision) throw projectConflict();
        await tx.$executeRaw`INSERT INTO project_category_versions(category_id,version,definition,actor_id,created_at) SELECT ${id}::uuid,COALESCE(max(version),0)+1,${JSON.stringify(d.definition)}::jsonb,${i.user.id}::uuid,${new Date()} FROM project_category_versions WHERE category_id=${id}::uuid`;
        await tx.$executeRaw`UPDATE project_category_drafts SET published_revision=revision WHERE category_id=${id}::uuid`;
        await this.event(tx, i, id, 'PUBLISHED', { revision: expected });
      }
      return this.read(tx, i, id);
    });
  }
  async bootstrap(i: Identity, localDevelopment = false) {
    if (i.user.role !== 'ADMIN') throw forbidden();
    return this.db.$transaction(async (tx) => {
      if (localDevelopment) {
        const target = await tx.$queryRaw<
          { name: string; schema: string }[]
        >`SELECT current_database() AS name,current_schema() AS schema`;
        if (
          target[0]?.name !== 'helpdesk_dev' ||
          target[0]?.schema !== 'public'
        )
          throw forbidden();
        const actor = await tx.user.findFirst({
          where: {
            id: i.user.id,
            role: 'ADMIN',
            isActive: true,
            mustChangePassword: false,
          },
          select: { id: true },
        });
        if (!actor) throw forbidden();
      } else await new ProjectWorkflowRepository(this.db).actor(tx, i);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(781902)::text`;
      const result = { created: 0, existing: 0, conflicts: [] as string[] };
      for (const c of projectCategoryReferences) {
        const existing = await tx.$queryRaw<
          { reference_key: string | null }[]
        >`SELECT reference_key FROM project_categories WHERE reference_key=${c.key} OR lower(btrim(name))=lower(btrim(${c.name}))`;
        if (existing.length) {
          if (existing.length === 1 && existing[0]!.reference_key === c.key)
            result.existing++;
          else result.conflicts.push(c.key);
          continue;
        }
        const id = (
          await tx.$queryRaw<
            { id: string }[]
          >`INSERT INTO project_categories(reference_key,name,description) VALUES(${c.key},${c.name},${c.description}) RETURNING id`
        )[0]!.id;
        const definition = initialProjectForm(c.key),
          json = JSON.stringify(definition),
          now = new Date();
        await tx.$executeRaw`INSERT INTO project_category_versions(category_id,version,definition,actor_id,created_at) VALUES(${id}::uuid,1,${json}::jsonb,${i.user.id}::uuid,${now})`;
        await tx.$executeRaw`INSERT INTO project_category_drafts(category_id,definition,revision,published_revision,actor_id,updated_at) VALUES(${id}::uuid,${json}::jsonb,1,1,${i.user.id}::uuid,${now})`;
        await this.event(tx, i, id, 'CREATED', { reference: c.key });
        result.created++;
      }
      return result;
    });
  }
  async capture(
    tx: Tx,
    projectId: string,
    categoryId: string,
    versionId: string,
    answers: Record<string, unknown>,
    identity: Identity,
    storage: AttachmentStorage,
  ) {
    const p = (
      await tx.$queryRaw<
        { name: string; definition: EditableForm; version: number }[]
      >`SELECT c.name,v.definition,v.version FROM project_categories c JOIN project_category_versions v ON v.category_id=c.id WHERE c.id=${categoryId}::uuid AND c.is_active AND v.id=${versionId}::uuid AND v.version=(SELECT max(version) FROM project_category_versions WHERE category_id=c.id) FOR SHARE OF c`
    )[0];
    if (!p)
      throw projectConflict(
        'Categoria inativa ou formulário atualizado. Selecione novamente.',
      );
    const definition = editableFormSchema.parse(p.definition),
      visible = visibleFormKeys(definition.fields, answers),
      clean: Record<string, unknown> = {};
    if (
      Object.keys(answers).some(
        (k) => !definition.fields.some((f) => f.key === k),
      )
    )
      throw invalid('Há respostas sem campo correspondente.');
    for (const f of definition.fields) {
      if (!visible.has(f.key)) continue;
      const v = answers[f.key];
      const empty =
        v === undefined ||
        v === '' ||
        (typeof v === 'string' && !v.trim()) ||
        (Array.isArray(v) && !v.length);
      if (empty) {
        if (f.required)
          throw invalid('Preencha o campo obrigatório: ' + f.label);
        continue;
      }
      const valid =
        f.type === 'FILE'
          ? z.array(z.uuid()).min(1).max(10).safeParse(v).success &&
            Array.isArray(v) &&
            new Set(v).size === v.length
          : f.type === 'NUMBER'
            ? typeof v === 'number' && Number.isFinite(v)
            : f.type === 'CHECKBOX'
              ? typeof v === 'boolean'
              : f.type === 'DATE'
                ? z.iso.date().safeParse(v).success
                : f.type === 'DATE_TIME'
                  ? z.iso.datetime().safeParse(v).success
                  : f.type === 'EMAIL'
                    ? z.email().safeParse(v).success
                    : f.type === 'URL'
                      ? z.url({ protocol: /^https?$/ }).safeParse(v).success
                      : f.type === 'SELECT'
                        ? typeof v === 'string' && !!f.options?.includes(v)
                        : f.type === 'MULTI_SELECT' ||
                            f.type === 'CHECKBOX_GROUP'
                          ? Array.isArray(v) &&
                            new Set(v).size === v.length &&
                            v.every(
                              (x) =>
                                typeof x === 'string' && f.options?.includes(x),
                            )
                          : typeof v === 'string';
      if (!valid) throw invalid('Resposta inválida: ' + f.label);
      if (f.type === 'FILE')
        await new ProjectFileRepository(this.db).claim(
          tx,
          identity,
          projectId,
          categoryId,
          versionId,
          f,
          v as string[],
          storage,
        );
      clean[f.key] = typeof v === 'string' ? v.trim() : v;
    }
    await tx.$executeRaw`INSERT INTO project_form_submissions(project_id,category_id,version_id,snapshot,answers) VALUES(${projectId}::uuid,${categoryId}::uuid,${versionId}::uuid,${JSON.stringify({ categoryName: p.name, version: p.version, ...definition })}::jsonb,${JSON.stringify(clean)}::jsonb)`;
  }
  async submission(i: Identity, id: string) {
    await new ProjectWorkflowRepository(this.db).read(i, id);
    const r = await this.db
      .$queryRaw`SELECT category_id AS "categoryId",version_id AS "versionId",snapshot,answers FROM project_form_submissions WHERE project_id=${id}::uuid`;
    return (r as unknown[])[0] ?? null;
  }
}
