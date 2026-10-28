import { createInterface } from 'node:readline/promises';
import { StringDecoder } from 'node:string_decoder';
import type { ReadStream, WriteStream } from 'node:tty';
import { ApplicationError } from '../src/shared/errors.js';

const cancelled = () =>
  new ApplicationError(
    'PROVISIONING_CANCELLED',
    130,
    'Provisionamento cancelado.',
  );
export function requireSecureTerminal(
  input: Pick<ReadStream, 'isTTY' | 'setRawMode'>,
  output: Pick<WriteStream, 'isTTY'>,
) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function')
    throw new ApplicationError(
      'SECURE_TERMINAL_REQUIRED',
      400,
      'Use um terminal PowerShell interativo com entrada oculta. Pipes, redirecionamentos e entrada visível de senha não são aceitos.',
    );
}
export async function readText(label: string, fallback: string) {
  requireSecureTerminal(process.stdin, process.stdout);
  const controller = new AbortController();
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
    historySize: 0,
  });
  terminal.once('SIGINT', () => controller.abort());
  terminal.once('close', () => controller.abort());
  try {
    return (
      (
        await terminal.question(`${label} [${fallback}]: `, {
          signal: controller.signal,
        })
      ).trim() || fallback
    );
  } catch {
    throw cancelled();
  } finally {
    terminal.close();
  }
}

// Native raw TTY input: no echo, stars, readline history or visible fallback.
// Buffers can be zeroed; JS strings and the terminal/OS cannot be fully wiped.
export function readHidden(
  label: string,
  input: ReadStream = process.stdin,
  output: WriteStream = process.stdout,
): Promise<Buffer> {
  requireSecureTerminal(input, output);
  const decoder = new StringDecoder('utf8'),
    parts: Buffer[] = [];
  const wasRaw = input.isRaw,
    wasPaused = input.isPaused();
  return new Promise((resolve, reject) => {
    let finished = false,
      length = 0;
    function finish(error?: Error) {
      if (finished) return;
      finished = true;
      input.off('data', data);
      input.off('end', ended);
      input.off('error', failed);
      process.off('SIGTERM', terminated);
      try {
        input.setRawMode(wasRaw);
      } catch {
        error ??= new ApplicationError(
          'SECURE_TERMINAL_REQUIRED',
          400,
          'Não foi possível restaurar o terminal com segurança.',
        );
      }
      if (wasPaused) input.pause();
      output.write('\n');
      const result = error ? undefined : Buffer.concat(parts);
      for (const part of parts) part.fill(0);
      parts.length = 0;
      if (error) reject(error);
      else resolve(result!);
    }
    function data(chunk: Buffer | string) {
      const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
      for (const character of text) {
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (['\u0003', '\u0004', '\u001b'].includes(character)) {
          finish(cancelled());
          return;
        }
        if (character === '\b' || character === '\u007f') {
          const removed = parts.pop();
          if (removed) {
            length -= removed.toString('utf8').length;
            removed.fill(0);
          }
          continue;
        }
        if (character < ' ' || length + character.length > 256) {
          finish(
            new ApplicationError(
              'PROVISIONING_INPUT',
              400,
              'Entrada de senha inválida ou muito longa.',
            ),
          );
          return;
        }
        parts.push(Buffer.from(character, 'utf8'));
        length += character.length;
      }
    }
    function ended() {
      finish(cancelled());
    }
    function failed() {
      finish(cancelled());
    }
    function terminated() {
      finish(cancelled());
    }
    try {
      input.setRawMode(true);
      input.on('data', data);
      input.once('end', ended);
      input.once('error', failed);
      process.once('SIGTERM', terminated);
      output.write(label + ': ');
      input.resume();
    } catch {
      finish(
        new ApplicationError(
          'SECURE_TERMINAL_REQUIRED',
          400,
          'O terminal não confirmou entrada oculta; operação interrompida.',
        ),
      );
    }
  });
}
