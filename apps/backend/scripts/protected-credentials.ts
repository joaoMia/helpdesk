import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { ApplicationError } from '../src/shared/errors.js';
import { provisioningSlots } from '../src/modules/provisioning/development-provisioning.js';
import type { ProvisioningEntry } from '../src/modules/provisioning/development-provisioning.js';
import type { CredentialDelivery } from '../src/modules/provisioning/automatic-provisioning.js';

const deliveryError = () =>
  new ApplicationError(
    'PROTECTED_DELIVERY',
    503,
    'Não foi possível confirmar o arquivo protegido. Não repita o provisionamento: confira localmente ACL, arquivo existente e contas, sem divulgar credenciais.',
  );

export async function prepareProtectedCredentials(
  entries: readonly ProvisioningEntry[],
  testDirectory?: string,
): Promise<CredentialDelivery> {
  if (
    process.platform !== 'win32' ||
    (testDirectory && process.env.NODE_ENV !== 'test')
  )
    throw deliveryError();
  const script = fileURLToPath(
    new URL('./protected-credentials.ps1', import.meta.url),
  );
  // Invoke reviewed local .NET/ACL commands without changing PowerShell's
  // execution policy. Only nonsecret source/test path appear in process args;
  // the generated credentials travel exclusively through anonymous stdin.
  const root = fileURLToPath(new URL('../../../', import.meta.url)).replace(
    /[/\\]$/,
    '',
  );
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const command = `& {\n${readFileSync(script, 'utf8')}\n} -RepositoryRoot ${quote(root)}${testDirectory ? ` -TestDirectory ${quote(testDirectory)}` : ''}`;
  const child = spawn(
    'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
  );
  // Helper diagnostics are deliberately discarded, never forwarded with payload.
  child.stderr.resume();
  child.stdin.on('error', () => {});
  const lines = createInterface({ input: child.stdout });
  let ready = false;
  const exited = new Promise<boolean>((resolve) => {
    child.once('error', () => resolve(false));
    child.once('close', (code) => {
      lines.close();
      resolve(code === 0);
    });
  });
  const path = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.stdin.end();
      reject(deliveryError());
    }, 15000);
    void exited.then(() => {
      clearTimeout(timer);
      if (!ready) reject(deliveryError());
    });
    lines.on('line', (line) => {
      try {
        const message = JSON.parse(line) as { ready?: boolean; path?: string };
        if (message.ready && typeof message.path === 'string') {
          ready = true;
          clearTimeout(timer);
          resolve(message.path);
        }
      } catch {
        /* Non-protocol output is not displayed or retained. */
      }
    });
    child.stdin.write(
      JSON.stringify({
        accounts: entries.map((entry) => ({
          ...entry,
          role: provisioningSlots.find((s) => s.key === entry.slot)!.role,
        })),
      }) + '\n',
    );
  });
  let finished = false;
  return {
    path,
    async finish(outcome) {
      if (finished) return;
      finished = true;
      child.stdin.end(outcome + '\n');
      const timer = setTimeout(() => child.kill(), 10000);
      const success = await exited;
      clearTimeout(timer);
      if (!success) throw deliveryError();
    },
  };
}
