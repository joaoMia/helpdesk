import { it, expect } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { d, account, mutate, origin, storage } from './lifecycle-fixture.js';
import { ProjectFileRepository } from '../../src/modules/projects/project-file.repository.js';
import { examplePdf, officeParts, testZip } from '../attachment-fixtures.js';
type Client = Awaited<ReturnType<typeof account>>['c'];
async function patch(c: Client, url: string, body: object) {
  const token = (await c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  return c.agent
    .patch(url)
    .set('Origin', origin)
    .set('X-CSRF-Token', token)
    .send(body);
}
async function context(conditional = false) {
  const a = await account('ADMIN'),
    r = await account('REQUESTER');
  const category = (
    await mutate(a.c, '/projects/categories', {
      name: 'Anexos ' + randomUUID(),
      description: 'Categoria sintética',
      isActive: true,
    })
  ).body.id as string;
  const field = {
    id: randomUUID(),
    key: 'proof',
    label: 'Comprovante de teste',
    type: 'FILE',
    required: true,
    ...(conditional ? { condition: { field: 'kind', includes: 'Sim' } } : {}),
  };
  const definition = {
    title: 'Arquivo obrigatório',
    description: '',
    fields: [
      ...(conditional
        ? [
            {
              id: randomUUID(),
              key: 'kind',
              label: 'Exige documento',
              type: 'SELECT',
              required: true,
              options: ['Sim', 'Não'],
            },
          ]
        : []),
      field,
    ],
  };
  expect(
    (
      await patch(a.c, '/projects/categories/' + category + '/form/draft', {
        expectedRevision: 0,
        definition,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await mutate(a.c, '/projects/categories/' + category + '/form/publish', {
        expectedRevision: 1,
      })
    ).status,
  ).toBe(200);
  const version = (
    await r.c.agent.get('/projects/categories/' + category + '/form')
  ).body.published.id as string;
  return { a, r, category, version, field, definition };
}
type F = Awaited<ReturnType<typeof context>>;
async function upload(
  f: F,
  name = 'prova.txt',
  bytes = Buffer.from('Arquivo sintético seguro'),
  client = f.r.c,
  fieldKey = 'proof',
  version = f.version,
) {
  const token = (await client.agent.get('/auth/csrf').set('Origin', origin))
    .body.csrfToken;
  return client.agent
    .post(
      '/projects/opening-uploads?' +
        new URLSearchParams({
          categoryId: f.category,
          versionId: version,
          fieldKey,
          name,
        }),
    )
    .set('Origin', origin)
    .set('X-CSRF-Token', token)
    .set('Content-Type', 'application/octet-stream')
    .send(bytes);
}
function payload(f: F, answers: Record<string, unknown>, key = randomUUID()) {
  return {
    title: 'Projeto com anexo',
    objective: 'Validar anexos reais de Projetos',
    need: 'Necessidade sintética para integração',
    clientOperationId: key,
    form: { categoryId: f.category, versionId: f.version, answers },
  };
}
it('preserva PDF, XLSX e Markdown da abertura com MIME verificado e download privado', async () => {
  const f = await context();
  const formats = [
    ['relatorio.pdf', examplePdf(), 'application/pdf'],
    [
      'dados.xlsx',
      testZip(officeParts('xlsx')),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    ['contexto.md', Buffer.from('# Ação\n3 < 5'), 'text/markdown'],
  ] as const;
  const files = [];
  for (const [name, bytes, mime] of formats) {
    const draft = await upload(f, name, bytes);
    expect(draft.status).toBe(201);
    expect(draft.body.upload.mime).toBe(mime);
    files.push(draft.body.upload.id as string);
  }
  const project = await mutate(
    f.r.c,
    '/projects',
    payload(f, { proof: files }),
  );
  expect(project.status).toBe(201);
  const path = '/projects/' + project.body.project.id + '/attachments';
  const list = await f.r.c.agent.get(path);
  expect(list.body.items).toHaveLength(3);
  for (const [index, [name, , mime]] of formats.entries()) {
    const result = await f.r.c.agent.get(
      path + '/' + files[index] + '?preview=true',
    );
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toContain(mime);
    expect(result.headers['content-disposition']).toMatch(/^attachment;/);
    expect(result.headers['content-disposition']).toContain(name);
  }
  const outsider = await account('REQUESTER');
  expect((await outsider.c.agent.get(path + '/' + files[0])).status).toBe(404);
});
it('arquivo obrigatório é reivindicado atomicamente; download respeita autor, ADMIN e responsável atual', async () => {
  const f = await context(),
    other = await account('REQUESTER'),
    t = await account('TECHNICIAN'),
    t2 = await account('TECHNICIAN');
  expect((await mutate(f.r.c, '/projects', payload(f, {}))).status).toBe(400);
  const up = await upload(f);
  expect(up.status).toBe(201);
  expect(up.body.upload).toMatchObject({ mime: 'text/plain' });
  expect(JSON.stringify(up.body)).not.toMatch(
    /storageKey|storage_key|sha256|C:\\/,
  );
  const file = up.body.upload.id as string;
  expect(
    (await d.db.projectAttachment.findUniqueOrThrow({ where: { id: file } }))
      .projectId,
  ).toBeNull();
  const body = payload(f, { proof: [file] });
  const created = await mutate(f.r.c, '/projects', body);
  expect(created.status).toBe(201);
  const id = created.body.project.id as string;
  expect((await mutate(f.r.c, '/projects', body)).body).toEqual(created.body);
  expect(
    (await d.db.projectAttachment.findUniqueOrThrow({ where: { id: file } }))
      .projectId,
  ).toBe(id);
  const list = await f.r.c.agent.get('/projects/' + id + '/attachments');
  expect(list.body.items).toHaveLength(1);
  expect(list.body.items[0].fieldLabel).toBe('Comprovante de teste');
  const download = await f.r.c.agent.get(
    '/projects/' + id + '/attachments/' + file,
  );
  expect(download.status).toBe(200);
  expect(download.text).toBe('Arquivo sintético seguro');
  expect(download.headers['content-disposition']).toMatch(/^attachment/);
  expect(download.headers['cache-control']).toBe('no-store');
  expect(
    (await other.c.agent.get('/projects/' + id + '/attachments/' + file))
      .status,
  ).toBe(404);
  expect(
    (await t.c.agent.get('/projects/' + id + '/attachments/' + file)).status,
  ).toBe(404);
  expect(
    (await f.a.c.agent.get('/projects/' + id + '/attachments/' + file)).status,
  ).toBe(200);
  expect(
    (
      await mutate(f.a.c, '/projects/' + id + '/assignment', {
        technicianId: t.u.id,
        reason: 'Atribuição sintética',
        expectedRevision: 1,
        clientOperationId: randomUUID(),
      })
    ).status,
  ).toBe(200);
  expect(
    (await t.c.agent.get('/projects/' + id + '/attachments/' + file)).status,
  ).toBe(200);
  expect(
    (
      await mutate(f.a.c, '/projects/' + id + '/assignment', {
        technicianId: t2.u.id,
        reason: 'Substituição sintética',
        expectedRevision: 2,
        clientOperationId: randomUUID(),
      })
    ).status,
  ).toBe(200);
  expect(
    (await t.c.agent.get('/projects/' + id + '/attachments/' + file)).status,
  ).toBe(404);
  expect(
    (await t2.c.agent.get('/projects/' + id + '/attachments/' + file)).status,
  ).toBe(200);
  const second = await upload(f);
  expect(second.status).toBe(201);
  expect(
    (await mutate(f.r.c, '/projects', payload(f, { proof: [file] }))).status,
  ).toBe(400);
  const foreign = await upload(
    f,
    'de-outro.txt',
    Buffer.from('Outro usuário'),
    other.c,
  );
  expect(foreign.status).toBe(201);
  expect(
    (
      await mutate(
        f.r.c,
        '/projects',
        payload(f, { proof: [foreign.body.upload.id] }),
      )
    ).status,
  ).toBe(400);
  const before = await d.db.projectRequest.count();
  expect(
    (
      await mutate(
        f.r.c,
        '/projects',
        payload(f, { proof: [second.body.upload.id, randomUUID()] }),
      )
    ).status,
  ).toBe(400);
  expect(await d.db.projectRequest.count()).toBe(before);
  expect(
    (
      await d.db.projectAttachment.findUniqueOrThrow({
        where: { id: second.body.upload.id },
      })
    ).projectId,
  ).toBeNull();
  const legacy = await mutate(f.r.c, '/projects', {
    title: 'Projeto antigo',
    objective: 'Objetivo suficiente legado',
    need: 'Necessidade suficiente legado',
    clientOperationId: randomUUID(),
  });
  expect(legacy.status).toBe(201);
  expect(
    (
      await f.r.c.agent.get(
        '/projects/' + legacy.body.project.id + '/attachments',
      )
    ).body.items,
  ).toEqual([]);
  expect(
    (
      await f.r.c.agent.get(
        '/projects/' + legacy.body.project.id + '/attachments/' + file,
      )
    ).status,
  ).toBe(404);
  await expect(
    d.db
      .$executeRaw`UPDATE project_attachments SET name='alterado.txt' WHERE id=${file}::uuid`,
  ).rejects.toThrow();
});
it('tipos reais, tamanho, sessão e campos incorretos são recusados; PNG recebe prévia segura', async () => {
  const f = await context(),
    t = await account('TECHNICIAN');
  expect(
    (await upload(f, 'pagina.html', Buffer.from('<html>unsafe</html>'))).status,
  ).toBe(400);
  expect(
    (await upload(f, 'falso.png', Buffer.from('Não é imagem'))).status,
  ).toBe(400);
  expect(
    (await upload(f, 'unsafe.txt', Buffer.from('<script>unsafe</script>')))
      .status,
  ).toBe(400);
  expect(
    (await upload(f, 'grande.txt', Buffer.alloc(10485761, 65))).status,
  ).toBe(413);
  expect(
    (await upload(f, 'valido.txt', Buffer.from('teste'), t.c)).status,
  ).toBe(403);
  expect(
    (await upload(f, 'valido.txt', Buffer.from('teste'), f.r.c, 'missing'))
      .status,
  ).toBe(404);
  expect(
    (
      await upload(
        f,
        'valido.txt',
        Buffer.from('teste'),
        f.r.c,
        'proof',
        randomUUID(),
      )
    ).status,
  ).toBe(404);
  const png = await sharp({
    create: { width: 2, height: 2, channels: 4, background: '#127782' },
  })
    .png()
    .toBuffer();
  const up = await upload(f, 'imagem.png', png);
  expect(up.status).toBe(201);
  expect(up.body.upload.mime).toBe('image/png');
  const c = await mutate(
    f.r.c,
    '/projects',
    payload(f, { proof: [up.body.upload.id] }),
  );
  expect(c.status).toBe(201);
  const preview = await f.r.c.agent.get(
    '/projects/' +
      c.body.project.id +
      '/attachments/' +
      up.body.upload.id +
      '?preview=true',
  );
  expect(preview.status).toBe(200);
  expect(preview.headers['content-type']).toMatch(/^image\/png/);
  expect(preview.headers['content-disposition']).toMatch(/^inline/);
  expect(preview.headers['x-content-type-options']).toBe('nosniff');
  expect(preview.headers['content-security-policy']).toContain('sandbox');
  const stored = await d.db.projectAttachment.findUniqueOrThrow({
    where: { id: up.body.upload.id },
  });
  const auditCount = await d.db.projectAttachmentEvent.count({
    where: { fileId: stored.id, kind: 'DOWNLOADED' },
  });
  await storage.removeOwn(stored.storageKey);
  expect(
    (
      await f.r.c.agent.get(
        '/projects/' + c.body.project.id + '/attachments/' + stored.id,
      )
    ).status,
  ).toBe(503);
  expect(
    await d.db.projectAttachmentEvent.count({
      where: { fileId: stored.id, kind: 'DOWNLOADED' },
    }),
  ).toBe(auditCount);
});
it('condição visível exige arquivo; versão nova não reescreve snapshot; temporários podem ser descartados', async () => {
  const f = await context(true);
  expect(
    (await mutate(f.r.c, '/projects', payload(f, { kind: 'Sim' }))).status,
  ).toBe(400);
  expect(
    (await mutate(f.r.c, '/projects', payload(f, { kind: 'Não' }))).status,
  ).toBe(201);
  const up = await upload(f),
    id = up.body.upload.id as string;
  const token = (await f.r.c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  expect(
    (
      await f.r.c.agent
        .delete('/projects/opening-uploads/' + id)
        .set('Origin', origin)
        .set('X-CSRF-Token', token)
    ).status,
  ).toBe(204);
  expect(await d.db.projectAttachment.findUnique({ where: { id } })).toBeNull();
  expect(
    (await mutate(f.r.c, '/projects', payload(f, { kind: 'Sim', proof: [id] })))
      .status,
  ).toBe(400);
  const valid = await upload(f);
  const made = await mutate(
    f.r.c,
    '/projects',
    payload(f, { kind: 'Sim', proof: [valid.body.upload.id] }),
  );
  expect(made.status).toBe(201);
  const before = (
    await f.r.c.agent.get('/projects/' + made.body.project.id + '/submission')
  ).body;
  expect(
    (
      await patch(f.a.c, '/projects/categories/' + f.category + '/form/draft', {
        expectedRevision: 1,
        definition: { ...f.definition, title: 'Versão revisada' },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await mutate(
        f.a.c,
        '/projects/categories/' + f.category + '/form/publish',
        { expectedRevision: 2 },
      )
    ).status,
  ).toBe(200);
  expect(
    (await f.r.c.agent.get('/projects/' + made.body.project.id + '/submission'))
      .body,
  ).toEqual(before);
  expect(
    (
      await f.r.c.agent.get(
        '/projects/' +
          made.body.project.id +
          '/attachments/' +
          valid.body.upload.id,
      )
    ).status,
  ).toBe(200);
  expect((await upload(f)).status).toBe(404);
});
it('auditoria com falha reverte reivindicação e mantém bytes; concorrência não reaproveita o mesmo arquivo', async () => {
  const f = await context(),
    other = await account('REQUESTER');
  const u = await upload(f),
    file = u.body.upload.id as string;
  const csrf = (await other.c.agent.get('/auth/csrf').set('Origin', origin))
    .body.csrfToken;
  expect(
    (
      await other.c.agent
        .delete('/projects/opening-uploads/' + file)
        .set('Origin', origin)
        .set('X-CSRF-Token', csrf)
    ).status,
  ).toBe(404);
  if (!/^dev003_[a-f0-9]{32}$/.test(d.schema))
    throw Error('Namespace inválido.');
  await d.db.$executeRawUnsafe(
    `CREATE FUNCTION "${d.schema}".reject_project_request_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit unavailable'; END $$`,
  );
  await d.db.$executeRawUnsafe(
    `CREATE TRIGGER reject_project_request_audit BEFORE INSERT ON "${d.schema}".project_request_events FOR EACH ROW EXECUTE FUNCTION "${d.schema}".reject_project_request_audit()`,
  );
  const body = payload(f, { proof: [file] });
  try {
    expect((await mutate(f.r.c, '/projects', body)).status).toBe(500);
    const row = await d.db.projectAttachment.findUniqueOrThrow({
      where: { id: file },
    });
    expect(row.projectId).toBeNull();
    expect((await storage.get(row.storageKey, row.sha256)).toString()).toBe(
      'Arquivo sintético seguro',
    );
    expect(await d.db.projectRequest.count()).toBe(0);
    expect(
      await d.db.projectAttachmentEvent.count({
        where: { fileId: file, kind: 'CLAIMED' },
      }),
    ).toBe(0);
  } finally {
    await d.db.$executeRawUnsafe(
      `DROP TRIGGER reject_project_request_audit ON "${d.schema}".project_request_events`,
    );
    await d.db.$executeRawUnsafe(
      `DROP FUNCTION "${d.schema}".reject_project_request_audit()`,
    );
  }
  const made = await mutate(f.r.c, '/projects', body);
  expect(made.status).toBe(201);
  const second = await upload(f);
  const one = payload(f, { proof: [second.body.upload.id] }),
    two = payload(f, { proof: [second.body.upload.id] });
  const results = await Promise.all([
    mutate(f.r.c, '/projects', one),
    mutate(f.r.c, '/projects', two),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
  expect(
    await d.db.projectAttachmentEvent.count({
      where: { fileId: second.body.upload.id, kind: 'CLAIMED' },
    }),
  ).toBe(1);
  await mutate(f.r.c, '/auth/logout', {});
  expect(
    (
      await f.r.c.agent.get(
        '/projects/' + made.body.project.id + '/attachments/' + file,
      )
    ).status,
  ).toBe(401);
});
it('limpeza exclui somente temporários expirados, preservando arquivo reivindicado', async () => {
  const f = await context();
  const up = await upload(f);
  const row = await d.db.projectAttachment.findUniqueOrThrow({
    where: { id: up.body.upload.id },
  });
  const c = await mutate(f.r.c, '/projects', payload(f, { proof: [row.id] }));
  expect(c.status).toBe(201);
  const old = await storage.put(Buffer.from('Temporário expirado'));
  const expired = await d.db.projectAttachment.create({
    data: {
      ownerId: f.r.u.id,
      categoryId: f.category,
      versionId: f.version,
      fieldId: f.field.id,
      fieldKey: 'proof',
      name: 'expirado.txt',
      mime: 'text/plain',
      size: 19,
      sha256: old.sha256,
      storageKey: old.key,
      createdAt: new Date(0),
      expiresAt: new Date(1000),
    },
  });
  expect(
    (await mutate(f.r.c, '/projects', payload(f, { proof: [expired.id] })))
      .status,
  ).toBe(400);
  const result = await new ProjectFileRepository(d.db).cleanExpired(storage);
  expect(result.expired).toBe(1);
  expect(
    await d.db.projectAttachment.findUnique({ where: { id: expired.id } }),
  ).toBeNull();
  await expect(storage.get(old.key, old.sha256)).rejects.toThrow();
  expect(
    (
      await f.r.c.agent.get(
        '/projects/' + c.body.project.id + '/attachments/' + row.id,
      )
    ).status,
  ).toBe(200);
});
