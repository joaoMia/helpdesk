import { deflateSync } from 'node:zlib';
import { examplePdf } from './attachment-fixtures.js';

export function modernPdf(compressedObjects: boolean, extraCatalog = '') {
  const offsets = new Map<number, number>();
  const parts = [Buffer.from('%PDF-1.5\n')];
  let length = parts[0]!.length;
  function append(id: number, body: string | Buffer) {
    offsets.set(id, length);
    const object = Buffer.concat([
      Buffer.from(`${id} 0 obj\n`),
      Buffer.from(body),
      Buffer.from('\nendobj\n'),
    ]);
    parts.push(object);
    length += object.length;
  }
  function stream(dictionary: string, bytes: Buffer) {
    const compressed = deflateSync(bytes);
    return Buffer.concat([
      Buffer.from(
        `<< ${dictionary} /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`,
      ),
      compressed,
      Buffer.from('\nendstream'),
    ]);
  }
  const catalog = `<< /Type /Catalog /Pages 2 0 R ${extraCatalog} >>`;
  if (compressedObjects) {
    append(
      4,
      stream('/Type /ObjStm /N 1 /First 4', Buffer.from('1 0 ' + catalog)),
    );
  } else append(1, catalog);
  append(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  append(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 120] /Resources <<>> >>',
  );
  const xrefId = compressedObjects ? 5 : 4;
  const xrefOffset = length;
  offsets.set(xrefId, xrefOffset);
  const table = Buffer.alloc((xrefId + 1) * 7);
  table.writeUInt16BE(65535, 5);
  for (let id = 1; id <= xrefId; id++) {
    const entry = id * 7;
    const isCompressed = compressedObjects && id === 1;
    table[entry] = isCompressed ? 2 : 1;
    table.writeUInt32BE(isCompressed ? 4 : offsets.get(id)!, entry + 1);
  }
  append(
    xrefId,
    stream(`/Type /XRef /Root 1 0 R /Size ${xrefId + 1} /W [1 4 2]`, table),
  );
  return Buffer.concat([
    ...parts,
    Buffer.from(`startxref\n${xrefOffset}\n%%EOF\n`),
  ]);
}

export function incrementalPdf(replacePreviousCatalog = false) {
  const base = replacePreviousCatalog
    ? examplePdf('/OpenAction [3 0 R /Fit]')
    : examplePdf();
  const previous = /startxref\n(\d+)/.exec(base.toString())![1];
  const replacement = replacePreviousCatalog
    ? '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
    : '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources <<>> >>\nendobj\n';
  const updatedOffset = base.length + Buffer.byteLength(replacement);
  return Buffer.concat([
    base,
    Buffer.from(
      `${replacement}xref\n${replacePreviousCatalog ? 1 : 3} 1\n${String(base.length).padStart(10, '0')} 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R /Prev ${previous} >>\nstartxref\n${updatedOffset}\n%%EOF\n`,
    ),
  ]);
}
