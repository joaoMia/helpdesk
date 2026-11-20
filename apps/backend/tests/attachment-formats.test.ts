import { expect, it } from '@jest/globals';
import sharp from 'sharp';
import { validateAttachment } from '../src/modules/tickets/attachment-storage.js';
import { examplePdf, officeParts, testZip } from './attachment-fixtures.js';

it.each([
  ['RELATO.TXT', '\uFEFFAção: 3 < 5 e 6 > 2\r\nOutra linha', 'text/plain'],
  ['roteiro.md', '# Diagnóstico\n\n`limite < 10`', 'text/markdown'],
  ['lista.csv', 'Nome;Código\r\n"Máquina; reserva";42\r\n', 'text/csv'],
])('aceita texto UTF-8 válido em %s', async (name, content, mime) => {
  expect(await validateAttachment(name, Buffer.from(content))).toEqual({
    name,
    bytes: Buffer.from(content.replace(/^\uFEFF/, '')),
    mime,
  });
});

it.each(['docx', 'xlsx', 'pptx'] as const)(
  'valida a estrutura de um %s sem macros',
  async (format) => {
    const name = 'anexo.' + format;
    const bytes = testZip(officeParts(format));
    expect(await validateAttachment(name, bytes)).toMatchObject({
      name,
      bytes,
      mime: expect.stringMatching(/^application\/vnd.openxmlformats/),
    });
  },
);

it('aceita XLSX com comentário ZIP e rejeita bytes fora de um comentário declarado', async () => {
  const workbook = testZip(officeParts('xlsx'));
  const comment = Buffer.from('Exportação de planilha UTF-8');
  await expect(
    validateAttachment('planilha.xlsx', Buffer.concat([workbook, comment])),
  ).rejects.toMatchObject({ code: 'INVALID_FILE' });
  workbook.writeUInt16LE(comment.length, workbook.length - 2);
  const bytes = Buffer.concat([workbook, comment]);
  await expect(
    validateAttachment('planilha.xlsx', bytes),
  ).resolves.toMatchObject({
    name: 'planilha.xlsx',
    bytes,
  });
});

it('aceita PDF estático com tabela de referências verificável', async () => {
  const bytes = examplePdf();
  expect(await validateAttachment('anexo.pdf', bytes)).toEqual({
    name: 'anexo.pdf',
    bytes,
    mime: 'application/pdf',
  });
});

it.each([
  ['png', 'png'],
  ['jpg', 'jpeg'],
] as const)('decodifica e sanitiza imagem %s', async (extension, format) => {
  const bytes = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#abcdef' },
  })
    .toFormat(format)
    .toBuffer();
  const image = await validateAttachment('original.' + extension, bytes);
  expect(image).toMatchObject({ name: 'original.png', mime: 'image/png' });
  expect((await sharp(image.bytes).metadata()).format).toBe('png');
});

it('distingue formato proibido, excesso, codificação e conteúdo inválido', async () => {
  await expect(
    validateAttachment('programa.exe', Buffer.from('sintético')),
  ).rejects.toMatchObject({ code: 'FILE_FORMAT_NOT_ALLOWED' });
  await expect(
    validateAttachment('excesso.txt', Buffer.from('abcd'), 3),
  ).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', status: 413 });
  await expect(
    validateAttachment('latin.txt', Buffer.from('Ação', 'latin1')),
  ).rejects.toThrow('UTF-8');
  await expect(
    validateAttachment('ativo.txt', Buffer.from('<html>Exemplo</html>')),
  ).rejects.toThrow('HTML');
  await expect(
    validateAttachment(
      'incompleto.csv',
      Buffer.from('nome,valor\n"campo aberto'),
    ),
  ).rejects.toThrow('CSV');
  await expect(
    validateAttachment(
      'irregular.csv',
      Buffer.from('nome,valor\num,dois,três'),
    ),
  ).rejects.toThrow('CSV');
});

it('recusa ZIP incorreto, formato Office diferente, macro e relacionamento externo', async () => {
  await expect(
    validateAttachment('outro.docx', testZip(officeParts('xlsx'))),
  ).rejects.toThrow('Office');
  await expect(
    validateAttachment('zip.docx', testZip({ 'a.xml': '<root/>' })),
  ).rejects.toThrow('Office');
  await expect(
    validateAttachment(
      'macro.docx',
      testZip({
        ...officeParts('docx'),
        'word/vbaProject.bin': 'binário sintético',
      }),
    ),
  ).rejects.toThrow('Office');
  const parts = officeParts('docx');
  const external = parts['_rels/.rels'].replace(
    'Target="word/document.xml"',
    'Target="https://example.invalid/test" TargetMode="External"',
  );
  await expect(
    validateAttachment(
      'link.docx',
      testZip({ ...parts, '_rels/.rels': external }),
    ),
  ).rejects.toThrow('Office');
  await expect(
    validateAttachment(
      'xml.docx',
      testZip({
        ...parts,
        'word/document.xml': '<!DOCTYPE document><document/>',
      }),
    ),
  ).rejects.toThrow('Office');
});

it('recusa PDF adulterado e PDF com ação automática identificada por nome escapado', async () => {
  await expect(
    validateAttachment('truncado.pdf', examplePdf().subarray(0, 96)),
  ).rejects.toThrow('PDF');
  await expect(
    validateAttachment('ativo.pdf', examplePdf('/#4fpenAction [3 0 R /Fit]')),
  ).rejects.toThrow('PDF');
});
