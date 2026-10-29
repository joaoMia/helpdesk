import { it, expect } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
it('reset real recusa terminal não interativo antes de acessar banco ou pedir senha', () => {
  const script = fileURLToPath(
    new URL('../scripts/reset-requester.ts', import.meta.url),
  );
  const result = spawnSync(process.execPath, ['--import', 'tsx', script], {
    encoding: 'utf8',
    input: '',
  });
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toContain('terminal PowerShell interativo');
});
