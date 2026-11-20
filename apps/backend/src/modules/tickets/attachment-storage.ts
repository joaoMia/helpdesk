import { randomUUID, createHash } from 'node:crypto';
import {
  mkdir,
  lstat,
  realpath,
  writeFile,
  readFile,
  unlink,
  readdir,
  chmod,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { ApplicationError } from '../../shared/errors.js';
import {
  attachmentMimeByExtension,
  attachmentNameSchema,
} from '@helpdesk/contracts';
import {
  hasInvalidTextControls,
  validateOfficeDocument,
} from './attachment-documents.js';
import { validateStaticPdf } from './attachment-pdf.js';
const invalid = (message: string) =>
  new ApplicationError('INVALID_FILE', 400, message);
const tooLarge = () =>
  new ApplicationError(
    'FILE_TOO_LARGE',
    413,
    'O arquivo excede o tamanho máximo permitido.',
  );
const local = fileURLToPath(new URL('../../../../../.local/', import.meta.url));
export const attachmentLimits = { bytes: 10 * 1024 * 1024, count: 10 };
export function configureAttachmentLimits(
  bytes = attachmentLimits.bytes,
  count = attachmentLimits.count,
) {
  if (
    !Number.isInteger(bytes) ||
    bytes < 1024 ||
    bytes > 20 * 1024 * 1024 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 20
  )
    throw new Error('Limites de anexos inválidos.');
  return { bytes, count };
}
export async function validateAttachment(
  name: unknown,
  input: Buffer,
  max = attachmentLimits.bytes,
) {
  const parsed = attachmentNameSchema.safeParse(name);
  if (!parsed.success) throw invalid('O nome do arquivo é inválido.');
  if (!input.length) throw invalid('O arquivo está vazio.');
  if (input.length > max) throw tooLarge();
  const extension = path.extname(parsed.data).toLowerCase();
  if (!Object.hasOwn(attachmentMimeByExtension, extension))
    throw new ApplicationError(
      'FILE_FORMAT_NOT_ALLOWED',
      400,
      'O formato do arquivo não é permitido.',
    );
  const mime =
    attachmentMimeByExtension[
      extension as keyof typeof attachmentMimeByExtension
    ];
  if (mime.startsWith('text/')) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(input);
    } catch {
      throw invalid(
        'O texto não está codificado em UTF-8. Salve o arquivo em UTF-8 e tente novamente.',
      );
    }
    if (!text.length) throw invalid('O arquivo está vazio.');
    if (hasInvalidTextControls(text))
      throw invalid(
        'O arquivo contém caracteres de controle incompatíveis com texto.',
      );
    if (
      /^\s*(?:<!doctype\s+html\b|<\s*(?:html|head|body|script|iframe|svg)\b|<\?xml\b|#!)/i.test(
        text,
      )
    )
      throw invalid(
        'O arquivo contém HTML, XML ou um script em vez do formato de texto selecionado.',
      );
    if (extension === '.csv') {
      const columns = [',', ';', '\t'].map((separator) =>
        csvWidth(text, separator),
      );
      if (
        !columns.some((width) => width > 1) &&
        !columns.every((width) => width === 1)
      )
        throw invalid('O conteúdo não possui uma estrutura CSV válida.');
    }
    return {
      name: parsed.data,
      mime,
      bytes: Buffer.from(text, 'utf8'),
    };
  }
  if (extension === '.pdf') {
    await validateStaticPdf(input);
    return { name: parsed.data, mime, bytes: input };
  }
  if (extension === '.docx' || extension === '.xlsx' || extension === '.pptx') {
    try {
      validateOfficeDocument(input, extension);
    } catch {
      throw invalid(
        'Documento Office inválido, incompatível ou com conteúdo ativo. Envie um arquivo sem macros, objetos incorporados ou vínculos externos.',
      );
    }
    return { name: parsed.data, mime, bytes: input };
  }
  const formats: Record<string, string> = {
    '.jpg': 'jpeg',
    '.jpeg': 'jpeg',
    '.png': 'png',
    '.webp': 'webp',
    '.gif': 'gif',
  };
  let bytes: Buffer;
  try {
    const image = sharp(input, {
      limitInputPixels: 16_000_000,
      failOn: 'warning',
      animated: false,
    });
    const metadata = await image.metadata();
    if (metadata.format !== formats[extension])
      throw invalid('O conteúdo da imagem não corresponde à extensão.');
    // Decode/re-encode, strip metadata/trailing payloads. GIF preview is first frame.
    bytes = await image.rotate().png().toBuffer();
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw invalid(
      'A imagem é inválida, excede o limite de pixels ou não pode ser lida.',
    );
  }
  if (bytes.length > max) throw tooLarge();
  return {
    name: parsed.data.replace(/\.[^.]+$/, '.png'),
    mime: 'image/png' as const,
    bytes,
  };
}

function csvWidth(text: string, separator: string) {
  type Field = 'start' | 'plain' | 'quoted' | 'closed';
  let field: Field = 'start';
  let columns = 1;
  let expected: number | undefined;
  let hasValue = false;
  for (let i = 0; i <= text.length; i++) {
    const char = text[i];
    if (field === 'quoted') {
      if (char === undefined) return 0;
      if (char === '"') {
        if (text[i + 1] === '"') i++;
        else field = 'closed';
      }
      continue;
    }
    if (char === '\n' || char === '\r' || char === undefined) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      if (hasValue) {
        if (expected !== undefined && expected !== columns) return 0;
        expected = columns;
      }
      columns = 1;
      hasValue = false;
      field = 'start';
    } else if (char === separator) {
      columns++;
      hasValue = true;
      field = 'start';
    } else if (char === '"' && field === 'start') {
      hasValue = true;
      field = 'quoted';
    } else if (field === 'closed' || char === '"') return 0;
    else {
      hasValue = true;
      field = 'plain';
    }
  }
  return expected ?? 0;
}
export class AttachmentStorage {
  private ready?: Promise<void>;
  readonly root: string;
  constructor(testRoot?: string, scope: 'tickets' | 'projects' = 'tickets') {
    this.root =
      testRoot ??
      path.join(
        local,
        'storage',
        scope === 'projects' ? 'project-attachments' : 'attachments',
      );
    if (
      testRoot &&
      (process.env.NODE_ENV !== 'test' ||
        !path.resolve(testRoot).startsWith(path.resolve(local) + path.sep) ||
        !/^attachments-test-[a-f0-9-]{36}$/.test(path.basename(testRoot)))
    )
      throw new Error('Armazenamento de teste inválido.');
  }
  private async init() {
    await mkdir(path.dirname(this.root), { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32')
      await mkdir(this.root, { mode: 0o700 }).catch(
        (e: NodeJS.ErrnoException) => {
          if (e.code !== 'EEXIST') throw e;
        },
      );
    for (
      let p = this.root;
      path.resolve(p) !== path.resolve(local);
      p = path.dirname(p)
    ) {
      if (
        !path.resolve(p).startsWith(path.resolve(local) + path.sep) ||
        (p !== this.root && (await lstat(p)).isSymbolicLink())
      )
        throw new Error('Armazenamento privado inválido.');
    }
    if (process.platform === 'win32') {
      const quoted = this.root.replaceAll("'", "''");
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `$ErrorActionPreference='Stop'; $p='${quoted}'; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User; if(-not [System.IO.Directory]::Exists($p)) { $a=New-Object System.Security.AccessControl.DirectorySecurity; $a.SetOwner($sid); $a.SetAccessRuleProtection($true,$false); $a.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'))); [void][System.IO.Directory]::CreateDirectory($p,$a) }; $r=[System.IO.Directory]::GetAccessControl($p); $rules=@($r.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])); if(-not $r.AreAccessRulesProtected -or $rules.Count -ne 1 -or $rules[0].IdentityReference.Value -ne $sid.Value -or $rules[0].AccessControlType -ne 'Allow' -or $r.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'ACL recusada'}`,
        ],
        { windowsHide: true, stdio: 'pipe', timeout: 15000 },
      );
    } else await chmod(this.root, 0o700);
    if ((await lstat(this.root)).isSymbolicLink())
      throw new Error('Armazenamento redirecionado.');
  }
  private async location(key: string) {
    if (!/^[a-f0-9-]{36}\.bin$/.test(key))
      throw new Error('Identificador de arquivo inválido.');
    await (this.ready ??= this.init());
    const root = await realpath(this.root);
    if (root !== path.resolve(this.root))
      throw new Error('Armazenamento redirecionado.');
    return path.join(root, key);
  }
  async put(bytes: Buffer) {
    const key = randomUUID() + '.bin';
    try {
      await writeFile(await this.location(key), bytes, {
        flag: 'wx',
        mode: 0o600,
      });
    } catch {
      throw new ApplicationError(
        'UPLOAD_UNAVAILABLE',
        503,
        'Falha temporária no armazenamento do arquivo. Tente novamente.',
      );
    }
    return { key, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  async get(key: string, hash: string) {
    const file = await this.location(key);
    if (!(await lstat(file)).isFile() || (await lstat(file)).isSymbolicLink())
      throw new Error('Arquivo indisponível.');
    const b = await readFile(file);
    if (createHash('sha256').update(b).digest('hex') !== hash)
      throw new Error('Arquivo indisponível.');
    return b;
  }
  async removeOwn(key: string) {
    await unlink(await this.location(key)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }
  async cleanOrphans(referenced: ReadonlySet<string>) {
    await (this.ready ??= this.init());
    let removed = 0;
    for (const key of await readdir(this.root)) {
      if (!/^[a-f0-9-]{36}\.bin$/.test(key) || referenced.has(key)) continue;
      const f = await lstat(await this.location(key));
      if (
        f.isFile() &&
        !f.isSymbolicLink() &&
        Date.now() - f.mtimeMs > 86400000
      ) {
        await this.removeOwn(key);
        removed++;
      }
    }
    return removed;
  }
}
