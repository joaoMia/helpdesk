import { afterEach, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { automaticPlan } from '../src/modules/provisioning/automatic-provisioning.js';
import { passwordSchema } from '@helpdesk/contracts';
import { prepareProtectedCredentials } from '../scripts/protected-credentials.js';

const directories: string[] = [];
function directory() {
  const root = fileURLToPath(new URL('../../../.local/', import.meta.url));
  const dir = path.join(
    root,
    `dev0051-acl-${randomUUID().replaceAll('-', '')}`,
  );
  directories.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of directories.splice(0)) {
    // Each uniquely-created fixture is validated against the helper's test root.
    if (!/[/\\]\.local[/\\]dev0051-acl-[a-f0-9]{32}$/.test(dir))
      throw new Error('Unsafe cleanup path');
    rmSync(dir, { force: true, recursive: true });
  }
});

describe('DEV-005.1 entrega local protegida', () => {
  it('gera quatro senhas distintas compatíveis com a política e contas aprovadas', () => {
    const entries = automaticPlan();
    expect(new Set(entries.map((e) => e.password)).size).toBe(4);
    expect(
      entries.every((e) => passwordSchema.safeParse(e.password).success),
    ).toBe(true);
    expect(entries.every((e) => /^[A-Za-z0-9_-]{32}$/.test(e.password!))).toBe(
      true,
    );
    expect(entries.map((e) => e.name)).toEqual([
      'Admin',
      'Murilo',
      'Gabriel',
      'João',
    ]);
  });
  it('cria pasta/arquivo com ACL exclusiva do SID atual e não sobrescreve', async () => {
    const dir = directory(),
      entries = automaticPlan();
    const delivery = await prepareProtectedCredentials(entries, dir);
    await delivery.finish('commit');
    const metadata = execFileSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `
      $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      $result=@()
      foreach($p in @('${dir}', '${delivery.path}')) {
        $acl=if([System.IO.Directory]::Exists($p)){[System.IO.Directory]::GetAccessControl($p)}else{[System.IO.File]::GetAccessControl($p)}
        $rules=@($acl.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]))
        $result+=@{protected=$acl.AreAccessRulesProtected;ownerMatches=($acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value -eq $sid);onlyCurrent=($rules.Count -eq 1 -and $rules[0].IdentityReference.Value -eq $sid -and $rules[0].FileSystemRights -eq 'FullControl' -and -not $rules[0].IsInherited)}
      }
      ConvertTo-Json -Compress -InputObject $result
    `,
      ],
      { encoding: 'utf8' },
    );
    const acl = JSON.parse(metadata) as {
      protected: boolean;
      ownerMatches: boolean;
      onlyCurrent: boolean;
    }[];
    expect(acl).toHaveLength(2);
    expect(
      acl.every((a) => a.protected && a.ownerMatches && a.onlyCurrent),
    ).toBe(true);
    const original = readFileSync(delivery.path);
    // Assertions expose booleans, never the file content or generated secrets.
    expect(
      entries.every(
        (e) =>
          original.includes(Buffer.from(e.email)) &&
          original.includes(Buffer.from(e.password!)),
      ),
    ).toBe(true);
    await expect(
      prepareProtectedCredentials(automaticPlan(), dir),
    ).rejects.toMatchObject({ code: 'PROTECTED_DELIVERY' });
    expect(readFileSync(delivery.path).equals(original)).toBe(true);
    original.fill(0);
  }, 30000);
  it('recusa pasta com ACL herdada antes de criar qualquer arquivo', async () => {
    const dir = directory();
    mkdirSync(dir);
    await expect(
      prepareProtectedCredentials(automaticPlan(), dir),
    ).rejects.toMatchObject({ code: 'PROTECTED_DELIVERY' });
    expect(readdirSync(dir)).toHaveLength(0);
  }, 30000);
  it('rollback remove somente o arquivo recém-criado quando o banco confirmou ausência', async () => {
    const delivery = await prepareProtectedCredentials(
      automaticPlan(),
      directory(),
    );
    await delivery.finish('abort');
    expect(existsSync(delivery.path)).toBe(false);
  }, 30000);
  it('não permite desviar o helper de teste para outro caminho', async () => {
    await expect(
      prepareProtectedCredentials(automaticPlan(), 'C:\\dev\\helpdesk'),
    ).rejects.toMatchObject({ code: 'PROTECTED_DELIVERY' });
  }, 30000);
});
