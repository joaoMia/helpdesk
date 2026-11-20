import { attachmentMimeByExtension } from '@helpdesk/contracts';
export const attachmentAccept = Object.keys(attachmentMimeByExtension).join(
  ',',
);
export const attachmentMaxBytes = 10 * 1024 * 1024;

export function attachmentSelectionError(
  files: readonly Pick<File, 'name' | 'size'>[],
) {
  for (const file of files) {
    const extension = /\.[a-z0-9]+$/i.exec(file.name)?.[0].toLowerCase() ?? '';
    if (!Object.hasOwn(attachmentMimeByExtension, extension))
      return `Formato não permitido: ${file.name}.`;
    if (file.size === 0) return `O arquivo ${file.name} está vazio.`;
    if (file.size > attachmentMaxBytes)
      return `O arquivo ${file.name} excede o limite de 10 MB.`;
  }
  return null;
}

type AttachmentKind =
  'image' | 'word' | 'sheet' | 'text' | 'pdf' | 'slides' | 'file';

const attachmentKinds = new Map<string, AttachmentKind>([
  ...['png', 'jpg', 'jpeg', 'webp', 'gif'].map(
    (ext) => [ext, 'image'] as const,
  ),
  ...['doc', 'docx', 'docm'].map((ext) => [ext, 'word'] as const),
  ...['xls', 'xlsx', 'xlsm', 'csv'].map((ext) => [ext, 'sheet'] as const),
  ['txt', 'text'],
  ['md', 'text'],
  ['pdf', 'pdf'],
  ['pptx', 'slides'],
]);

export function attachmentDisplay(name: string, mime?: string) {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  const kind =
    attachmentKinds.get(extension) ??
    (mime === 'image/png' ? 'image' : mime === 'text/plain' ? 'text' : 'file');
  const textPreview =
    kind === 'text' ||
    extension === 'csv' ||
    mime === 'text/csv' ||
    mime === 'text/markdown';
  return { kind, extension: extension.toUpperCase(), textPreview };
}

export const formatAttachmentSize = (size: number) =>
  size >= 1024 * 1024
    ? (size / (1024 * 1024)).toLocaleString('pt-BR', {
        maximumFractionDigits: 1,
      }) + ' MB'
    : Math.ceil(size / 1024) + ' KB';

export const fileSelectionKey = (file: File) =>
  JSON.stringify([file.name, file.size, file.lastModified, file.type]);

export function newSelections(
  existing: readonly File[],
  chosen: readonly File[],
) {
  const keys = new Set(existing.map(fileSelectionKey));
  return chosen.filter((file) => {
    const key = fileSelectionKey(file);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

export async function safeLocalImage(file: File) {
  if (file.size > attachmentMaxBytes) return null;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = String.fromCharCode(...bytes);
  const extension = attachmentDisplay(file.name).extension;
  let mime: string | undefined;
  if (
    extension === 'PNG' &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
  )
    mime = 'image/png';
  if (
    (extension === 'JPEG' || extension === 'JPG') &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    mime = 'image/jpeg';
  if (extension === 'GIF' && /^GIF8[79]a/.test(ascii)) mime = 'image/gif';
  if (
    extension === 'WEBP' &&
    ascii.startsWith('RIFF') &&
    ascii.slice(8) === 'WEBP'
  )
    mime = 'image/webp';
  return mime ? file.slice(0, file.size, mime) : null;
}

export async function attachmentTextExcerpt(blob: Blob) {
  const maxBytes = 4096;
  const bytes = await blob.slice(0, maxBytes).arrayBuffer();
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes, {
    stream: blob.size > maxBytes,
  });
  if (
    [...text].some(
      (char) => char.charCodeAt(0) < 32 && !'\t\n\r'.includes(char),
    )
  )
    throw new Error('Arquivo de texto inválido.');
  const lines = text.split(/\r\n?|\n/);
  const snippet = lines.slice(0, 12).join('\n');
  return snippet + (blob.size > maxBytes || lines.length > 12 ? '\n…' : '');
}
