import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthClient } from '../src/lib/auth-client';
import { projectAttachmentsSchema } from '@helpdesk/contracts';
const id = '00000000-0000-4000-8000-000000000001',
  stamp = '2026-11-08T12:00:00.000Z';
test('upload e descarte de Projetos usam rotas próprias, cookies e CSRF sem transformar arquivo em JSON', async () => {
  const sent: { url: string; options: RequestInit | undefined }[] = [];
  const client = createAuthClient(async (url, options) => {
    sent.push({ url: String(url), options });
    if (String(url).endsWith('/csrf'))
      return Response.json({ csrfToken: 'ficticio' });
    if (options?.method === 'DELETE')
      return new Response(null, { status: 204 });
    return Response.json({
      upload: {
        id,
        name: 'prova.txt',
        mime: 'text/plain',
        size: 5,
        expiresAt: stamp,
      },
    });
  });
  const file = new File(['prova'], 'prova.txt', { type: 'text/plain' });
  const uploaded = await client.uploadProjectOpeningFile(
    { categoryId: id, versionId: id, fieldKey: 'proof' },
    file,
  );
  assert.equal(uploaded.id, id);
  const call = sent.find((v) => v.options?.method === 'POST')!;
  assert.ok(call.url.includes('/projects/opening-uploads?'));
  assert.ok(!call.url.includes('/tickets'));
  assert.equal(call.options?.credentials, 'include');
  assert.equal(call.options?.body, file);
  assert.equal(
    (call.options?.headers as Record<string, string>)['X-CSRF-Token'],
    'ficticio',
  );
  assert.equal(
    (call.options?.headers as Record<string, string>)['Content-Type'],
    'application/octet-stream',
  );
  await client.discardProjectOpeningFile(id);
  assert.ok(
    sent.some(
      (v) =>
        v.url.endsWith('/projects/opening-uploads/' + id) &&
        v.options?.method === 'DELETE',
    ),
  );
});
test('metadados recusam caminhos privados e MIME ativo; download de Projeto permanece autenticado', async () => {
  const item = {
    id,
    name: 'imagem.png',
    mime: 'image/png',
    size: 10,
    fieldKey: 'proof',
    fieldLabel: 'Comprovante',
    createdAt: stamp,
  };
  assert.equal(
    projectAttachmentsSchema.safeParse({ items: [item] }).success,
    true,
  );
  assert.equal(
    projectAttachmentsSchema.safeParse({
      items: [{ ...item, storageKey: 'privado.bin' }],
    }).success,
    false,
  );
  assert.equal(
    projectAttachmentsSchema.safeParse({
      items: [{ ...item, mime: 'image/svg+xml' }],
    }).success,
    false,
  );
  let requested = '';
  const client = createAuthClient(async (url, options) => {
    requested = String(url);
    assert.equal(options?.credentials, 'include');
    assert.equal(options?.cache, 'no-store');
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      headers: { 'Content-Type': 'image/png' },
    });
  });
  const blob = await client.downloadAttachment(id, id, 'projects');
  assert.ok(requested.endsWith('/projects/' + id + '/attachments/' + id));
  assert.equal(blob.type, 'image/png');
});
