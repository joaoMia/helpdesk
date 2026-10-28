import { describe, expect, it } from '@jest/globals';
import { PassThrough, Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ReadStream, WriteStream } from 'node:tty';
import {
  readHidden,
  requireSecureTerminal,
} from '../scripts/secure-console.js';
import {
  assertProvisioningDatabase,
  provisioningTarget,
} from '../src/modules/provisioning/development-provisioning.js';

class Input extends PassThrough {
  isTTY = true;
  isRaw = false;
  setRawMode(value: boolean) {
    this.isRaw = value;
    return this;
  }
}
function terminal() {
  const input = new Input(),
    messages: string[] = [];
  const output = Object.assign(
    new Writable({
      write(chunk, _encoding, callback) {
        messages.push(String(chunk));
        callback();
      },
    }),
    { isTTY: true },
  );
  return {
    input,
    output,
    read: () =>
      readHidden(
        'Senha',
        input as unknown as ReadStream,
        output as unknown as WriteStream,
      ),
    text: () => messages.join(''),
  };
}
describe('HD-019 terminal e destino seguros', () => {
  it('comando real recusa execução com stdin/stdout em pipe', () => {
    const script = fileURLToPath(
      new URL('../scripts/provision-development.ts', import.meta.url),
    );
    const result = spawnSync(process.execPath, ['--import', 'tsx', script], {
      encoding: 'utf8',
      input: 'entrada-sintetica-nao-utilizada',
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('terminal PowerShell interativo');
  });
  it('aceita somente development e URL local helpdesk_dev sem opções de redirecionamento', () => {
    const valid = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://127.0.0.1/helpdesk_dev',
    };
    expect(provisioningTarget(valid)).toBe(valid.DATABASE_URL);
    for (const change of [
      { NODE_ENV: 'production' },
      { NODE_ENV: 'test' },
      { DATABASE_URL: 'postgresql://127.0.0.1/helpdesk_test' },
      { DATABASE_URL: 'postgresql://example.invalid/helpdesk_dev' },
      {
        DATABASE_URL:
          'postgresql://127.0.0.1/helpdesk_dev?host=example.invalid',
      },
      { DATABASE_URL: 'postgresql://127.0.0.1/helpdesk_dev?schema=outro' },
    ])
      expect(() => provisioningTarget({ ...valid, ...change })).toThrow(
        expect.objectContaining({ code: 'PROVISIONING_TARGET' }),
      );
  });
  it('valida identidade efetiva do banco e recusa test/public ou produção', () => {
    expect(() =>
      assertProvisioningDatabase('development', 'helpdesk_dev', 'public'),
    ).not.toThrow();
    for (const [mode, db, schema] of [
      ['production', 'helpdesk_dev', 'public'],
      ['development', 'helpdesk_test', 'public'],
      ['test', 'helpdesk_test', 'public'],
      ['development', 'outro', 'public'],
    ])
      expect(() => assertProvisioningDatabase(mode!, db!, schema!)).toThrow(
        expect.objectContaining({ code: 'PROVISIONING_TARGET' }),
      );
  });
  it('não aceita pipe, saída redirecionada ou terminal sem raw mode', () => {
    const t = terminal();
    for (const [input, output] of [
      [{ ...t.input, isTTY: false }, t.output],
      [t.input, { isTTY: false }],
      [{ isTTY: true }, t.output],
    ])
      expect(() =>
        requireSecureTerminal(input as ReadStream, output as WriteStream),
      ).toThrow(expect.objectContaining({ code: 'SECURE_TERMINAL_REQUIRED' }));
  });
  it('senha não aparece nem com estrelas e raw mode é restaurado', async () => {
    const t = terminal(),
      result = t.read();
    expect(t.input.isRaw).toBe(true);
    t.input.emit('data', Buffer.from('entrada-sintetica-nao-credencial\r'));
    const secret = await result;
    try {
      expect(secret.toString() === 'entrada-sintetica-nao-credencial').toBe(
        true,
      );
      expect(t.text()).toBe('Senha: \n');
      expect(t.input.isRaw).toBe(false);
      expect(t.input.listenerCount('data')).toBe(0);
    } finally {
      secret.fill(0);
    }
  });
  it('trata Unicode fragmentado e backspace sem eco', async () => {
    const t = terminal(),
      result = t.read(),
      emoji = Buffer.from('🙂');
    t.input.emit('data', emoji.subarray(0, 1));
    t.input.emit('data', emoji.subarray(1));
    t.input.emit('data', Buffer.from('\u007foutra entrada de teste\r'));
    const secret = await result;
    try {
      expect(secret.toString() === 'outra entrada de teste').toBe(true);
      expect(t.text()).toBe('Senha: \n');
    } finally {
      secret.fill(0);
    }
  });
  it('Ctrl+C cancela, remove listeners e restaura modo do terminal', async () => {
    const t = terminal(),
      result = t.read();
    const rejected = expect(result).rejects.toMatchObject({
      code: 'PROVISIONING_CANCELLED',
    });
    t.input.emit('data', Buffer.from('texto-ficticio\u0003'));
    await rejected;
    expect(t.text()).toBe('Senha: \n');
    expect(t.input.isRaw).toBe(false);
    expect(t.input.listenerCount('data')).toBe(0);
  });
  it('falha de raw mode interrompe sem fallback visível', async () => {
    const t = terminal();
    t.input.setRawMode = () => {
      throw new Error('sem raw mode');
    };
    await expect(t.read()).rejects.toMatchObject({
      code: 'SECURE_TERMINAL_REQUIRED',
    });
    expect(t.text()).not.toContain('senha');
  });
});
