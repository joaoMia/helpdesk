import { crc32, deflateRawSync } from 'node:zlib';

export function testZip(entries: Record<string, string | Buffer>) {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, source] of Object.entries(entries)) {
    const bytes = Buffer.from(source);
    const compressed = deflateRawSync(bytes);
    const key = Buffer.from(name);
    const crc = crc32(bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(key.length, 26);
    local.push(header, key, compressed);
    const item = Buffer.alloc(46);
    item.writeUInt32LE(0x02014b50);
    item.writeUInt16LE(20, 6);
    item.writeUInt16LE(8, 10);
    item.writeUInt32LE(crc, 16);
    item.writeUInt32LE(compressed.length, 20);
    item.writeUInt32LE(bytes.length, 24);
    item.writeUInt16LE(key.length, 28);
    item.writeUInt32LE(offset, 42);
    central.push(item, key);
    offset += header.length + key.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

const formats = {
  docx: [
    'word/document.xml',
    'wordprocessingml',
    'document',
    'document',
    '<body><p><r><t>Texto isolado</t></r></p></body>',
  ],
  xlsx: [
    'xl/workbook.xml',
    'spreadsheetml',
    'sheet',
    'workbook',
    '<sheets><sheet name="Dados" sheetId="1" r:id="s1"/></sheets>',
  ],
  pptx: [
    'ppt/presentation.xml',
    'presentationml',
    'presentation',
    'presentation',
    '<sldIdLst/>',
  ],
} as const;
const relsNamespace =
  'http://schemas.openxmlformats.org/package/2006/relationships';
const officeRel =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export function officeParts(format: keyof typeof formats) {
  const [main, language, content, root, body] = formats[format];
  return {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
      <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
      <Default Extension="xml" ContentType="application/xml"/>
      <Override PartName="/${main}" ContentType="application/vnd.openxmlformats-officedocument.${language}.${content}.main+xml"/>
      ${format === 'xlsx' ? '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' : ''}
    </Types>`,
    '_rels/.rels': `<Relationships xmlns="${relsNamespace}"><Relationship Id="r1" Type="${officeRel}/officeDocument" Target="${main}"/></Relationships>`,
    [main]: `<${root} xmlns="http://schemas.openxmlformats.org/${language}/2006/main" xmlns:r="${officeRel}">${body}</${root}>`,
    ...(format === 'xlsx'
      ? {
          'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${relsNamespace}"><Relationship Id="s1" Type="${officeRel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
          'xl/worksheets/sheet1.xml':
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>123</v></c></row></sheetData></worksheet>',
        }
      : {}),
  };
}

export function examplePdf(catalogEntry = '') {
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of [
    `<< /Type /Catalog /Pages 2 0 R ${catalogEntry} >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources <<>> >>',
  ].entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = pdf.length;
  pdf += 'xref\n0 4\n0000000000 65535 f \n';
  for (const offset of offsets.slice(1))
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  return Buffer.from(
    pdf + `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`,
  );
}
