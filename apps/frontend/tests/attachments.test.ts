import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AttachmentCard } from '../src/components/attachment-card';
import {
  attachmentDisplay,
  attachmentSelectionError,
  attachmentTextExcerpt,
  newSelections,
  safeLocalImage,
} from '../src/lib/attachment-display';

Object.assign(globalThis, { React });

test('seleção separa erro de formato, arquivo vazio e limite excedido', () => {
  assert.equal(
    attachmentSelectionError([{ name: 'NOTAS.TXT', size: 10 }]),
    null,
  );
  assert.match(
    attachmentSelectionError([{ name: 'script.exe', size: 10 }])!,
    /Formato não permitido/,
  );
  assert.match(
    attachmentSelectionError([{ name: 'notas.txt', size: 0 }])!,
    /vazio/,
  );
  assert.match(
    attachmentSelectionError([{ name: 'notas.txt', size: 11 * 1024 * 1024 }])!,
    /10 MB/,
  );
});

test('cartões identificam Word, Excel e TXT com nome, extensão e tamanho', () => {
  for (const [name, kind, metadata] of [
    ['documento.docx', 'word', 'Word · DOCX · 1 KB'],
    ['planilha.xlsx', 'sheet', 'Planilha · XLSX · 1 KB'],
    ['evidencia.txt', 'text', 'Texto · TXT · 1 KB'],
  ]) {
    const html = renderToStaticMarkup(
      React.createElement(AttachmentCard, {
        file: { name: name!, size: 1024 },
        onRemove: () => {},
      }),
    );
    assert.ok(html.includes(`data-type="${kind}"`));
    assert.ok(html.includes(metadata!));
    assert.ok(html.includes(`aria-label="Remover ${name}"`));
    assert.doesNotMatch(html, /<img|<iframe/);
  }
  assert.deepEqual(attachmentDisplay('relatorio.pdf'), {
    kind: 'pdf',
    extension: 'PDF',
    textPreview: false,
  });
  assert.equal(attachmentDisplay('tabela.csv').textPreview, true);
  assert.equal(attachmentDisplay('leia.md').textPreview, true);
});

test('somente a imagem publicada usa o cartão ampliado', () => {
  const file = { name: 'foto.png', mime: 'image/png', size: 1024 };
  const persisted = renderToStaticMarkup(
    React.createElement(AttachmentCard, {
      file,
      imageUrl: '/api/tickets/isolado/attachments/imagem?preview=true',
    }),
  );
  const local = renderToStaticMarkup(
    React.createElement(AttachmentCard, {
      file,
      local: new File(['selecao'], file.name, { type: file.mime }),
    }),
  );
  assert.match(persisted, /attachment-card-published-image/);
  assert.doesNotMatch(local, /attachment-card-published-image/);
});

test('miniatura local valida a assinatura e recusa SVG ou HTML com nome de imagem', async () => {
  const png = new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    'foto.png',
  );
  assert.equal((await safeLocalImage(png))?.type, 'image/png');
  assert.equal(await safeLocalImage(new File(['<svg/>'], 'foto.png')), null);
  assert.equal(await safeLocalImage(new File(['<script>'], 'foto.jpg')), null);
  assert.equal(await safeLocalImage(new File([png], 'foto.webp')), null);
});

test('prévia TXT preserva linhas, limita o conteúdo e recusa bytes binários', async () => {
  const lines = Array.from({ length: 13 }, (_, i) => `Linha ${i + 1}`);
  assert.equal(
    await attachmentTextExcerpt(new Blob([lines.join('\r\n')])),
    lines.slice(0, 12).join('\n') + '\n…',
  );
  assert.equal(
    (await attachmentTextExcerpt(new Blob(['a'.repeat(4300)]))).length,
    4098,
  );
  await assert.rejects(
    attachmentTextExcerpt(new Blob([new Uint8Array([0, 2, 255])])),
  );
});

test('seleção múltipla ignora repetição do mesmo arquivo e aceita outras entradas', () => {
  const first = new File(['um'], 'a.txt', { lastModified: 1 });
  const repeated = new File(['um'], 'a.txt', { lastModified: 1 });
  const second = new File(['dois'], 'b.txt', { lastModified: 1 });
  assert.deepEqual(newSelections([first], [repeated, second, second]), [
    second,
  ]);
});
