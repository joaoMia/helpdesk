import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { ApplicationError } from '../../shared/errors.js';

const require = createRequire(import.meta.url);
const pdfErrors = {
  10: [
    'PDF_INVALID',
    400,
    'PDF corrompido, malformado ou incompatível. Exporte novamente o documento como PDF.',
  ],
  11: [
    'PDF_PROTECTED',
    400,
    'PDF criptografado ou protegido por senha. Envie uma cópia sem proteção.',
  ],
  12: [
    'PDF_ACTIVE_CONTENT',
    400,
    'O PDF contém conteúdo ativo ou incorporado proibido. Exporte uma versão estática.',
  ],
  13: [
    'PDF_PROCESSING_LIMIT',
    400,
    'O PDF excede os limites de processamento. Exporte uma versão mais simples.',
  ],
} as const;

const unavailable = () =>
  new ApplicationError(
    'UPLOAD_UNAVAILABLE',
    503,
    'Falha temporária ao validar o PDF. Tente novamente.',
  );

let activeValidations = 0;
export async function validateStaticPdf(bytes: Buffer) {
  if (activeValidations >= 2) throw unavailable();
  activeValidations++;
  try {
    const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
    const worker = fileURLToPath(
      new URL(`./attachment-pdf-worker.${extension}`, import.meta.url),
    );
    const wasm = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');
    const result = await new Promise<number | null>((resolve, reject) => {
      // V8 limits WebAssembly linear memory independently of the JavaScript heap.
      const child = spawn(
        process.execPath,
        ['--max-old-space-size=64', '--wasm-max-mem-pages=2048', worker, wasm],
        { env: {}, stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true },
      );
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, 8000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        resolve(timedOut ? 13 : code);
      });
      child.stdin.on('error', () => {
        /* Child closes stdin when validation cannot start. */
      });
      child.stdin.end(bytes);
    });
    if (result === 0) return;
    if (result !== null && Object.hasOwn(pdfErrors, result)) {
      const [code, status, message] =
        pdfErrors[result as keyof typeof pdfErrors];
      throw new ApplicationError(code, status, message);
    }
    throw unavailable();
  } catch (error) {
    if (error instanceof ApplicationError) throw error;
    throw unavailable();
  } finally {
    activeValidations--;
  }
}
