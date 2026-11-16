import { it, expect } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { d, account, mutate, origin } from './lifecycle-fixture.js';
async function patch(
  c: Awaited<ReturnType<typeof account>>['c'],
  url: string,
  body: object,
) {
  const csrf = (await c.agent.get('/auth/csrf').set('Origin', origin)).body
    .csrfToken;
  return c.agent
    .patch(url)
    .set('Origin', origin)
    .set('X-CSRF-Token', csrf)
    .send(body);
}
const base = '/projects/categories';
const request = () => ({
  title: 'Projeto real de teste',
  objective: 'Objetivo suficiente para validação',
  need: 'Necessidade suficiente para validação',
  clientOperationId: randomUUID(),
});
it('grupo de checkboxes persiste opções na versão publicada e recusa respostas não configuradas', async () => {
  const admin = await account('ADMIN'),
    requester = await account('REQUESTER');
  const category = await mutate(admin.c, base, {
    name: 'Opções ' + randomUUID(),
    description: '',
    isActive: true,
  });
  expect(category.status).toBe(201);
  const field = {
    id: randomUUID(),
    key: 'choices',
    label: 'Opções',
    type: 'CHECKBOX_GROUP',
    required: true,
    options: ['Opção A', 'Opção B'],
  };
  expect(
    (
      await patch(admin.c, base + '/' + category.body.id + '/form/draft', {
        expectedRevision: 0,
        definition: { title: 'Seleções', description: '', fields: [field] },
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await mutate(admin.c, base + '/' + category.body.id + '/form/publish', {
        expectedRevision: 1,
      })
    ).status,
  ).toBe(200);
  const published = (
    await admin.c.agent.get(base + '/' + category.body.id + '/form')
  ).body.published;
  const sendAnswers = (answers: string[]) =>
    mutate(requester.c, '/projects', {
      ...request(),
      form: {
        categoryId: category.body.id,
        versionId: published.id,
        answers: { choices: answers },
      },
    });
  expect((await sendAnswers(['Não configurada'])).status).toBe(400);
  const accepted = await sendAnswers(['Opção B']);
  expect(accepted.status).toBe(201);
  const submission = await requester.c.agent.get(
    '/projects/' + accepted.body.project.id + '/submission',
  );
  expect(submission.body.snapshot.fields[0].options).toEqual([
    'Opção A',
    'Opção B',
  ]);
  expect(submission.body.answers.choices).toEqual(['Opção B']);
});
it('rascunhos concorrentes têm um vencedor; falha de auditoria desfaz toda a edição', async () => {
  const a = await account('ADMIN'),
    b = await account('ADMIN');
  const created = await mutate(a.c, base, {
    name: 'Concorrência ' + randomUUID(),
    description: '',
    isActive: true,
  });
  const id = created.body.id;
  const definition = {
    title: 'Plano de formulário',
    description: '',
    fields: [
      {
        id: randomUUID(),
        key: 'detail',
        label: 'Detalhe',
        type: 'TEXT',
        required: false,
      },
    ],
  };
  const results = await Promise.all([
    patch(a.c, base + '/' + id + '/form/draft', {
      expectedRevision: 0,
      definition,
    }),
    patch(b.c, base + '/' + id + '/form/draft', {
      expectedRevision: 0,
      definition: { ...definition, title: 'Concorrente' },
    }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const before = (await a.c.agent.get(base + '/' + id + '/form')).body;
  if (!/^dev003_[a-f0-9]{32}$/.test(d.schema))
    throw Error('Namespace isolado inválido.');
  await d.db.$executeRawUnsafe(
    `CREATE FUNCTION "${d.schema}".reject_catalog_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Audit unavailable'; END $$`,
  );
  await d.db.$executeRawUnsafe(
    `CREATE TRIGGER reject_catalog_audit BEFORE INSERT ON "${d.schema}".project_catalog_events FOR EACH ROW EXECUTE FUNCTION "${d.schema}".reject_catalog_audit()`,
  );
  try {
    expect(
      (
        await patch(a.c, base + '/' + id + '/form/draft', {
          expectedRevision: 1,
          definition: { ...definition, title: 'Não deve persistir' },
        })
      ).status,
    ).toBe(500);
    expect((await a.c.agent.get(base + '/' + id + '/form')).body).toEqual(
      before,
    );
  } finally {
    await d.db.$executeRawUnsafe(
      `DROP TRIGGER reject_catalog_audit ON "${d.schema}".project_catalog_events`,
    );
    await d.db.$executeRawUnsafe(
      `DROP FUNCTION "${d.schema}".reject_catalog_audit()`,
    );
  }
});
it('ADMIN cadastra sete referências idempotentes sem sobrescrever personalizações; ownership e snapshots são preservados', async () => {
  const a = await account('ADMIN'),
    r = await account('REQUESTER'),
    other = await account('REQUESTER'),
    t = await account('TECHNICIAN');
  expect((await mutate(r.c, base + '/bootstrap', {})).status).toBe(403);
  const init = await mutate(a.c, base + '/bootstrap', {});
  expect(init.status).toBe(200);
  expect(init.body.created).toBe(7);
  expect((await mutate(a.c, base + '/bootstrap', {})).body).toMatchObject({
    created: 0,
    existing: 7,
  });
  const categories = await r.c.agent.get(base);
  expect(categories.body).toHaveLength(7);
  const cat = categories.body[0];
  const f = (await a.c.agent.get(base + '/' + cat.id + '/form')).body;
  expect(f.published.version).toBe(1);
  expect(f.draft.published).toBe(true);
  const answers = {
    objective: 'Objetivo histórico do formulário',
    need: 'Necessidade histórica informada',
  };
  const payload = {
    ...request(),
    form: { categoryId: cat.id, versionId: f.published.id, answers },
  };
  const created = await mutate(r.c, '/projects', payload);
  expect(created.status).toBe(201);
  const id = created.body.project.id;
  const saved = await r.c.agent.get('/projects/' + id + '/submission');
  expect(saved.status).toBe(200);
  expect(saved.body.answers).toEqual(answers);
  expect(
    (await other.c.agent.get('/projects/' + id + '/submission')).status,
  ).toBe(404);
  expect((await t.c.agent.get('/projects/' + id + '/submission')).status).toBe(
    404,
  );
  expect((await mutate(r.c, '/projects', payload)).body).toEqual(created.body);
  const definition = {
    ...f.draft.definition,
    title: 'Título administrativo alterado',
  };
  expect(
    (
      await patch(a.c, base + '/' + cat.id + '/form/draft', {
        expectedRevision: 1,
        definition,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await patch(a.c, base + '/' + cat.id + '/form/draft', {
        expectedRevision: 1,
        definition,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await mutate(a.c, base + '/' + cat.id + '/form/publish', {
        expectedRevision: 2,
      })
    ).status,
  ).toBe(200);
  const current = (await r.c.agent.get(base + '/' + cat.id + '/form')).body;
  expect(current.published.version).toBe(2);
  expect((await r.c.agent.get('/projects/' + id + '/submission')).body).toEqual(
    saved.body,
  );
  expect(
    (await a.c.agent.get(base + '/' + cat.id + '/form?version=1')).body
      .published.title,
  ).toBe(f.published.title);
  expect(
    (
      await mutate(r.c, '/projects', {
        ...payload,
        clientOperationId: randomUUID(),
      })
    ).status,
  ).toBe(409);
  const renamed = await patch(a.c, base + '/' + cat.id, {
    name: 'Categoria personalizada',
    description: 'Preservar configuração',
    isActive: false,
    expectedRevision: cat.revision,
  });
  expect(renamed.status).toBe(200);
  expect((await mutate(a.c, base + '/bootstrap', {})).body.created).toBe(0);
  expect((await r.c.agent.get(base)).body).toHaveLength(6);
  expect(
    (await a.c.agent.get(base)).body.find(
      (c: { id: string }) => c.id === cat.id,
    ),
  ).toMatchObject({ name: 'Categoria personalizada', isActive: false });
  expect((await r.c.agent.get('/projects/' + id + '/submission')).body).toEqual(
    saved.body,
  );
  expect(
    (
      await mutate(r.c, '/projects', {
        ...request(),
        form: { categoryId: cat.id, versionId: current.published.id, answers },
      })
    ).status,
  ).toBe(409);
  await expect(
    d.db
      .$executeRaw`UPDATE project_form_submissions SET answers='{}'::jsonb WHERE project_id=${id}::uuid`,
  ).rejects.toThrow();
});
it('formulário publicado valida condições, tipos e obrigatoriedade; versões e auditoria têm rollback', async () => {
  const a = await account('ADMIN'),
    r = await account('REQUESTER');
  const c = await mutate(a.c, base, {
    name: 'Condicional ' + randomUUID(),
    description: '',
    isActive: true,
  });
  expect(c.status).toBe(201);
  const id = c.body.id;
  const fields = [
    {
      id: randomUUID(),
      key: 'kind',
      label: 'Tipo',
      type: 'SELECT',
      required: true,
      options: ['Sim', 'Não'],
    },
    {
      id: randomUUID(),
      key: 'detail',
      label: 'Detalhe',
      type: 'TEXT',
      required: true,
      condition: { field: 'kind', includes: 'Sim' },
    },
  ];
  const definition = {
    title: 'Formulário condicional',
    description: '',
    fields,
  };
  expect(
    (
      await patch(r.c, base + '/' + id + '/form/draft', {
        expectedRevision: 0,
        definition,
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await patch(a.c, base + '/' + id + '/form/draft', {
        expectedRevision: 0,
        definition,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await mutate(a.c, base + '/' + id + '/form/publish', {
        expectedRevision: 1,
      })
    ).status,
  ).toBe(200);
  const version = (await r.c.agent.get(base + '/' + id + '/form')).body
    .published.id;
  const create = (answers: unknown) =>
    mutate(r.c, '/projects', {
      ...request(),
      form: { categoryId: id, versionId: version, answers },
    });
  expect((await create({ kind: 'Sim' })).status).toBe(400);
  expect((await create({ kind: 'Outro' })).status).toBe(400);
  expect((await create({ kind: 'Não', unknown: 'x' })).status).toBe(400);
  const good = await create({ kind: 'Não', detail: 'oculto' });
  expect(good.status).toBe(201);
  expect(
    (await r.c.agent.get('/projects/' + good.body.project.id + '/submission'))
      .body.answers,
  ).toEqual({ kind: 'Não' });
  const bad = {
    ...definition,
    fields: [
      ...fields,
      {
        id: randomUUID(),
        key: 'file',
        label: 'Arquivo obrigatório',
        type: 'FILE',
        required: true,
      },
    ],
  };
  expect(
    (
      await patch(a.c, base + '/' + id + '/form/draft', {
        expectedRevision: 1,
        definition: bad,
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await mutate(a.c, base + '/' + id + '/form/publish', {
        expectedRevision: 2,
      })
    ).status,
  ).toBe(200);
  const after = (await a.c.agent.get(base + '/' + id + '/form')).body;
  expect(after.published.version).toBe(2);
  const broken = {
    ...definition,
    fields: [{ ...fields[1], condition: { field: 'missing', includes: 'x' } }],
  };
  expect(
    (
      await patch(a.c, base + '/' + id + '/form/draft', {
        expectedRevision: 2,
        definition: broken,
      })
    ).status,
  ).toBe(400);
  const legacy = await mutate(r.c, '/projects', request());
  expect(legacy.status).toBe(201);
  expect(
    (await r.c.agent.get('/projects/' + legacy.body.project.id + '/submission'))
      .body,
  ).toBeNull();
  await expect(
    d.db
      .$executeRaw`UPDATE project_category_versions SET version=99 WHERE category_id=${id}::uuid`,
  ).rejects.toThrow();
});
