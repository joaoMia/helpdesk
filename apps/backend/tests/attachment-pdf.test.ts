import { expect, it } from '@jest/globals';
import { createRequire } from 'node:module';
import qpdf from '@neslinesli93/qpdf-wasm';
import { validateAttachment } from '../src/modules/tickets/attachment-storage.js';
import { examplePdf } from './attachment-fixtures.js';
import { incrementalPdf, modernPdf } from './pdf-fixtures.js';

it.each([
  ['xref-stream', modernPdf(false)],
  ['object-stream', modernPdf(true)],
  ['incremental', incrementalPdf()],
] as const)(
  'aceita PDF legítimo %s preservando os bytes',
  async (name, bytes) => {
    await expect(validateAttachment(`${name}.pdf`, bytes)).resolves.toEqual({
      name: `${name}.pdf`,
      mime: 'application/pdf',
      bytes,
    });
  },
);

it.each([
  ['ação escapada', modernPdf(true, '/#4fpenAction [3 0 R /Fit]')],
  ['ação em revisão antiga', incrementalPdf(true)],
  [
    'JavaScript em catálogo comprimido',
    modernPdf(true, '/Names << /JavaScript <<>> >>'),
  ],
  ['arquivo incorporado', modernPdf(true, '/Names << /EmbeddedFiles <<>> >>')],
  ['ação nomeada', modernPdf(true, '/A << /S /Named /N /Print >>')],
] as const)('recusa PDF com %s', async (_name, bytes) => {
  await expect(validateAttachment('ativo.pdf', bytes)).rejects.toMatchObject({
    status: 400,
    code: 'PDF_ACTIVE_CONTENT',
  });
});

it.each([
  [
    'árvore de páginas inexistente',
    Buffer.from(
      examplePdf().toString().replace('/Pages 2 0 R', '/Pages 9 0 R'),
    ),
  ],
  [
    'sufixo fora do PDF',
    Buffer.concat([modernPdf(true), Buffer.from('retalho')]),
  ],
  ['PDF truncado', examplePdf().subarray(0, 96)],
  [
    'offset de referência inválido',
    Buffer.from(
      examplePdf()
        .toString()
        .replace(/startxref\n\d+/, 'startxref\n9'),
    ),
  ],
] as const)('recusa PDF com %s', async (_name, bytes) => {
  await expect(validateAttachment('invalido.pdf', bytes)).rejects.toMatchObject(
    {
      status: 400,
      code: 'PDF_INVALID',
    },
  );
});

it('diferencia PDF criptografado mesmo quando abre sem senha', async () => {
  const require = createRequire(import.meta.url);
  const factoryOptions = {
    locateFile: () => require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm'),
  };
  const pdf = await qpdf(factoryOptions);
  const fs = pdf.FS as typeof pdf.FS & {
    writeFile: (path: string, data: Uint8Array) => void;
  };
  fs.writeFile('/in.pdf', examplePdf());
  for (const password of ['', 'somente-teste']) {
    expect(
      pdf.callMain([
        '/in.pdf',
        '--encrypt',
        password,
        'proprietario-teste',
        '256',
        '--',
        '/encrypted.pdf',
      ]),
    ).toBe(0);
    await expect(
      validateAttachment(
        'protegido.pdf',
        Buffer.from(fs.readFile('/encrypted.pdf')),
      ),
    ).rejects.toMatchObject({
      status: 400,
      code: 'PDF_PROTECTED',
    });
  }
});

it('rejeita PDF acima do limite de upload', async () => {
  await expect(
    validateAttachment('excesso.pdf', modernPdf(true), 5),
  ).rejects.toMatchObject({
    status: 413,
    code: 'FILE_TOO_LARGE',
  });
});

it('interrompe inspeção com aninhamento acima do limite', async () => {
  const bytes = modernPdf(
    true,
    '/Dados ' + '['.repeat(70) + '0' + ']'.repeat(70),
  );
  await expect(validateAttachment('complexo.pdf', bytes)).rejects.toMatchObject(
    {
      status: 400,
      code: 'PDF_PROCESSING_LIMIT',
    },
  );
});
