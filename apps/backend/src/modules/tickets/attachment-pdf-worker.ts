import { readFileSync } from 'node:fs';
import startQpdf from '@neslinesli93/qpdf-wasm';

const INVALID = 10;
const PROTECTED = 11;
const ACTIVE = 12;
const LIMIT = 13;
const maxObjects = 8192;
const maxRevisions = 8;
type RecordValue = Record<string, unknown>;
type WriteByte = (byte: number | null) => void;
type QpdfStdio = {
  FS: { init: (input: null, output: WriteByte, error: WriteByte) => void };
};

const forbiddenNames = new Set(
  'AA AcroForm AF Annots Collection Encrypt EF EmbeddedFile EmbeddedFiles Filespec GoToE GoToR ImportData JavaScript JS Launch Movie Named OpenAction RichMedia Rendition Sound SubmitForm URI XFA 3D RichMediaExecute Hide ResetForm SetOCGState Thread Trans GoTo3DView GoToDp GoToDPart FFilter FDecodeParms'
    .toLowerCase()
    .split(' '),
);
const reference = /^\d+ \d+ R$/;
const dict = (value: unknown): RecordValue | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
const pdfName = (name: string) =>
  name
    .replace(/#([\da-f]{2})/gi, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .slice(1)
    .toLowerCase();

function dereference(value: unknown, objects: RecordValue) {
  return typeof value === 'string' && reference.test(value)
    ? dict(objects['obj:' + value])?.value
    : value;
}

function inspect(value: unknown, objects: RecordValue, depth = 0) {
  if (depth > 64) throw LIMIT;
  if (typeof value === 'string') {
    if (value.startsWith('/') && forbiddenNames.has(pdfName(value)))
      throw ACTIVE;
    // QPDF prefixes PDF strings with u: or b:. Bare n g R values are references.
    if (reference.test(value) && !Object.hasOwn(objects, 'obj:' + value))
      throw INVALID;
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) inspect(child, objects, depth + 1);
    return;
  }
  const object = dict(value);
  if (!object) return;
  if (
    typeof object['/Type'] === 'string' &&
    pdfName(object['/Type']) === 'action' &&
    object['/S'] !== '/GoTo'
  )
    throw ACTIVE;
  for (const [key, child] of Object.entries(object)) {
    if (key.startsWith('/')) {
      const name = pdfName(key);
      if (forbiddenNames.has(name)) throw ACTIVE;
      if (name === 'a') {
        const action = dict(dereference(child, objects));
        if (action && Object.hasOwn(action, '/S') && action['/S'] !== '/GoTo')
          throw ACTIVE;
      }
    }
    inspect(child, objects, depth + 1);
  }
}

function inspectObjects(json: string) {
  const output = JSON.parse(json);
  const objects = dict(output?.qpdf?.[1]);
  const trailer = dict(dict(objects?.trailer)?.value);
  if (
    !objects ||
    !trailer ||
    typeof trailer['/Root'] !== 'string' ||
    !reference.test(trailer['/Root'])
  )
    throw INVALID;
  if (Object.keys(objects).length > maxObjects + 1) throw LIMIT;
  const catalog = dict(dict(objects['obj:' + trailer['/Root']])?.value);
  if (!catalog || catalog['/Type'] !== '/Catalog') throw INVALID;
  const pages = dict(dict(objects['obj:' + String(catalog['/Pages'])])?.value);
  if (
    !pages ||
    pages['/Type'] !== '/Pages' ||
    !Number.isInteger(pages['/Count']) ||
    Number(pages['/Count']) < 1
  )
    throw INVALID;
  for (const entry of Object.values(objects)) {
    const stream = dict(dict(entry)?.stream);
    const streamDict = dict(stream?.dict);
    // An external stream points to a file rather than storing its bytes in the PDF.
    if (streamDict) {
      if (Object.keys(streamDict).some((key) => pdfName(key) === 'f'))
        throw ACTIVE;
      const filters = dereference(streamDict['/Filter'], objects);
      if (Array.isArray(filters) && filters.length > 8) throw LIMIT;
    }
    inspect(entry, objects);
  }
  return trailer['/Prev'];
}

async function validate(bytes: Buffer) {
  const text = bytes.toString('latin1');
  if (!/^%PDF-(?:1\.[0-7]|2\.0)(?:\r\n?|\n)/.test(text)) throw INVALID;
  const endings = new Map<number, number[]>();
  let last: { xref: number; end: number } | undefined;
  // Only line-delimited revision endings may be matched against a parsed /Prev.
  const markers =
    /(?:^|[\r\n])startxref[\t\r\n ]+(\d{1,10})[\t\r\n ]+%%EOF(?=[\t\r\n ]|$)/g;
  for (const match of text.matchAll(markers)) {
    const xref = Number(match[1]);
    const end = match.index + match[0].length;
    if (xref <= 8 || xref >= match.index) continue;
    const positions = endings.get(xref) ?? [];
    if (positions.length >= maxRevisions || endings.size >= maxRevisions)
      throw LIMIT;
    positions.push(end);
    endings.set(xref, positions);
    last = { xref, end };
  }
  if (!last || !/^[\t\r\n ]*$/.test(text.slice(last.end))) throw INVALID;

  const wasm = process.argv[2]!;
  const output = Buffer.alloc(8 * 1024 * 1024);
  let length = 0;
  let overflow: boolean;
  let capture = false;
  let encryptionDiagnostic = '';
  let probingEncryption = false;
  const options = {
    locateFile: () => wasm,
    noFSInit: true,
    preRun: [
      (qpdf: QpdfStdio) =>
        qpdf.FS.init(
          null,
          (byte) => {
            if (!capture || byte === null) return;
            if (length < output.length) output[length++] = byte;
            else overflow = true;
          },
          (byte) => {
            if (
              probingEncryption &&
              byte !== null &&
              encryptionDiagnostic.length < 512
            )
              encryptionDiagnostic += String.fromCharCode(byte);
          },
        ),
    ],
  };
  const qpdf = await startQpdf(options);
  const fs = qpdf.FS as typeof qpdf.FS & {
    writeFile: (path: string, data: Uint8Array) => void;
  };
  const input = '/upload.pdf';
  const strict = '--suppress-recovery';
  let current = last;
  for (let revision = 0; revision < maxRevisions; revision++) {
    fs.writeFile(input, revision ? bytes.subarray(0, current.end) : bytes);
    encryptionDiagnostic = '';
    probingEncryption = true;
    const encrypted = qpdf.callMain([input, '--is-encrypted']);
    probingEncryption = false;
    if (encrypted === 0 || /: invalid password\r?\n/.test(encryptionDiagnostic))
      throw PROTECTED;
    capture = true;
    length = 0;
    overflow = false;
    const code = qpdf.callMain([
      strict,
      input,
      '--json-output=2',
      '--json-stream-data=none',
      '-',
    ]);
    capture = false;
    if (overflow) throw LIMIT;
    if (code !== 0) throw INVALID;
    const previous = inspectObjects(output.toString('utf8', 0, length));
    capture = true;
    length = 0;
    overflow = false;
    const checked = qpdf.callMain([strict, input, '--check']);
    capture = false;
    if (overflow) throw LIMIT;
    if (checked !== 0) throw INVALID;
    if (previous === undefined) return;
    if (
      typeof previous !== 'number' ||
      !Number.isSafeInteger(previous) ||
      previous === current.xref
    )
      throw INVALID;
    // In a linearized PDF, the first-page xref may point forward to the main xref.
    if (previous > current.xref) {
      if (
        previous < current.end &&
        output.toString('utf8', 0, length).includes('\nFile is linearized\n')
      )
        return;
      throw INVALID;
    }
    const positions = endings.get(previous)?.filter((end) => end < current.end);
    if (positions?.length !== 1) throw INVALID;
    current = { xref: previous, end: positions[0]! };
  }
  throw LIMIT;
}

try {
  await validate(readFileSync(0));
} catch (error) {
  if (typeof error === 'number') process.exitCode = error;
  else if (error instanceof SyntaxError) process.exitCode = INVALID;
  else if (
    error instanceof RangeError ||
    (error instanceof Error && /memory|heap|bad_alloc/i.test(error.message))
  )
    process.exitCode = LIMIT;
  else process.exitCode = 14;
}
