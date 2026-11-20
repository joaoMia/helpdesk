import { posix } from 'node:path';
import { readOfficeZip } from './attachment-zip.js';

function requireDocument(condition: unknown): asserts condition {
  if (!condition) throw new Error('Documento inválido ou incompatível.');
}

export function hasInvalidTextControls(text: string) {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (
      (code < 32 && code !== 9 && code !== 10 && code !== 13) ||
      (code >= 127 && code < 160)
    )
      return true;
  }
  return false;
}

const officeParts = {
  '.docx': ['word/document.xml', 'document', 'wordprocessingml', 'document'],
  '.xlsx': ['xl/workbook.xml', 'workbook', 'spreadsheetml', 'sheet'],
  '.pptx': [
    'ppt/presentation.xml',
    'presentation',
    'presentationml',
    'presentation',
  ],
} as const;
const activePart =
  /macro|vbaProject|activeX|embeddings|oleObject|externalLink|attachedTemplate|customUI|webextension|queryTable|connection|altChunk|aFChunk/i;
const forbiddenElements = new Set([
  'oleobject',
  'altchunk',
  'control',
  'externalreference',
  'externalbook',
  'ddelink',
  'ddelinks',
  'webextension',
]);
const activeInstruction =
  /\bDDE(?:AUTO)?\b|\|[^!]*!|\b(?:WEBSERVICE|RTD)\s*\(/i;

type XmlTag = { name: string; attributes: Map<string, string> };

function xmlText(text: string) {
  return text.replace(
    /&(#x[0-9a-f]+|#\d+|amp|apos|quot|lt|gt);|&/gi,
    (entity, key?: string) => {
      requireDocument(key);
      if (key[0] === '#') {
        const hex = key[1]?.toLowerCase() === 'x';
        const value = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
        requireDocument(
          value <= 0x10ffff &&
            value !== 0 &&
            (value >= 32 || [9, 10, 13].includes(value)) &&
            !(value >= 0xd800 && value <= 0xdfff),
        );
        return String.fromCodePoint(value);
      }
      const predefined: Record<string, string> = {
        amp: '&',
        apos: "'",
        quot: '"',
        lt: '<',
        gt: '>',
      };
      requireDocument(Object.hasOwn(predefined, key) && entity.length <= 6);
      return predefined[key]!;
    },
  );
}

// Inspect XML lexically without DTDs, external entities, or an XML runtime.
function inspectXml(bytes: Buffer, visit?: (tag: XmlTag) => void) {
  const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  requireDocument(!hasInvalidTextControls(value));
  const tokens =
    /<!--[^]*?-->|<\?xml\s[^?]*\?>|<!\[CDATA\[[^]*?\]\]>|<\/([\w.:-]+)\s*>|<([A-Za-z_][\w.:-]*)([^"'<>]*?(?:(?:"[^"<]*"|'[^'<]*')[^"'<>]*?)*)(\/?)>|([^<]+)/gy;
  const attribute = /\s+([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/gy;
  const stack: string[] = [];
  const instructions: string[] = [];
  const captureInstruction = (fragment: string) => {
    const parent = stack.at(-1)?.split(':').at(-1)?.toLowerCase();
    if (parent === 'instrtext' || parent === 'f') instructions.push(fragment);
  };
  let root: XmlTag | undefined;
  while (tokens.lastIndex < value.length) {
    const match = tokens.exec(value);
    requireDocument(match);
    const [raw, closing, opening, attributes, empty, text] = match;
    if (closing) {
      requireDocument(stack.pop() === closing);
    } else if (opening) {
      const tag: XmlTag = { name: opening, attributes: new Map() };
      const attrText = attributes!.trimEnd();
      attribute.lastIndex = 0;
      while (attribute.lastIndex < attrText.length) {
        const attr = attribute.exec(attrText);
        requireDocument(attr && !tag.attributes.has(attr[1]!));
        tag.attributes.set(attr[1]!, xmlText(attr[2] ?? attr[3]!));
      }
      if (!stack.length) {
        requireDocument(!root);
        root = tag;
      }
      if (!empty) stack.push(opening);
      requireDocument(stack.length <= 256);
      const local = tag.name.split(':').at(-1)!.toLowerCase();
      requireDocument(!forbiddenElements.has(local));
      requireDocument(!/^ppaction:/i.test(tag.attributes.get('action') ?? ''));
      if (local === 'fldsimple')
        requireDocument(
          ![...tag.attributes.values()].some((v) => activeInstruction.test(v)),
        );
      visit?.(tag);
    } else if (text !== undefined) {
      const decoded = xmlText(text);
      requireDocument(stack.length > 0 || !decoded.trim());
      captureInstruction(decoded);
    } else if (raw.startsWith('<![CDATA[')) {
      requireDocument(stack.length > 0);
      captureInstruction(raw.slice(9, -3));
    } else if (raw.startsWith('<?')) {
      requireDocument(
        match.index === 0 && !/encoding\s*=\s*["'](?!utf-8["'])/i.test(raw),
      );
    }
  }
  requireDocument(
    root && !stack.length && !activeInstruction.test(instructions.join('')),
  );
  return root;
}

export function validateOfficeDocument(
  file: Buffer,
  extension: keyof typeof officeParts,
) {
  const entries = readOfficeZip(file);
  const [main, element, language, suffix] = officeParts[extension];
  const manifest = entries.get('[Content_Types].xml');
  const rootRelationships = entries.get('_rels/.rels');
  requireDocument(manifest && rootRelationships && entries.has(main));
  let mainDeclared = false;
  const types = inspectXml(manifest, ({ name, attributes }) => {
    const mime = attributes.get('ContentType');
    if (mime) requireDocument(!activePart.test(mime));
    if (
      name.split(':').at(-1) === 'Override' &&
      attributes.get('PartName') === '/' + main
    )
      mainDeclared =
        mime ===
        `application/vnd.openxmlformats-officedocument.${language}.${suffix}.main+xml`;
  });
  requireDocument(mainDeclared && types.name.split(':').at(-1) === 'Types');
  let mainRelated = false;
  for (const [name, bytes] of entries) {
    requireDocument(!activePart.test(name));
    if (name === '[Content_Types].xml') continue;
    if (name.endsWith('.rels')) {
      const relationships = inspectXml(bytes, ({ name: tag, attributes }) => {
        if (tag.split(':').at(-1) !== 'Relationship') return;
        const target = decodeURIComponent(attributes.get('Target') ?? '');
        const type = attributes.get('Type');
        requireDocument(type && !activePart.test(type));
        requireDocument(
          !attributes.has('TargetMode') ||
            attributes.get('TargetMode') === 'Internal',
        );
        requireDocument(
          target && !/[:\\?#%]/.test(target) && !target.startsWith('//'),
        );
        const dir =
          name === '_rels/.rels'
            ? '/'
            : posix.dirname(posix.dirname('/' + name));
        const part = posix.resolve(dir, target).slice(1);
        requireDocument(entries.has(part));
        if (name === '_rels/.rels' && /\/officeDocument$/.test(type)) {
          requireDocument(!mainRelated && part === main);
          mainRelated = true;
        }
      });
      requireDocument(relationships.name.split(':').at(-1) === 'Relationships');
      continue;
    }
    if (name.endsWith('.xml')) {
      const root = inspectXml(bytes);
      if (name === main) {
        const prefix = root.name.split(':');
        const namespace = root.attributes.get(
          prefix.length > 1 ? 'xmlns:' + prefix[0] : 'xmlns',
        );
        requireDocument(
          prefix.at(-1) === element &&
            (namespace ===
              `http://schemas.openxmlformats.org/${language}/2006/main` ||
              namespace === `http://purl.oclc.org/ooxml/${language}/main`),
        );
      }
      continue;
    }
    // Office may include raster media. Reject embedded OLE, SVG and executable parts.
    requireDocument(
      (/\.png$/i.test(name) &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (/\.jpe?g$/i.test(name) &&
          bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) ||
        (/\.gif$/i.test(name) &&
          /^GIF8[79]a/.test(bytes.toString('ascii', 0, 6))) ||
        (/\.webp$/i.test(name) &&
          bytes.toString('ascii', 0, 4) === 'RIFF' &&
          bytes.toString('ascii', 8, 12) === 'WEBP'),
    );
  }
  requireDocument(mainRelated);
}
