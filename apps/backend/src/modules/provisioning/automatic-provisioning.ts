import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../shared/errors.js';
import {
  inspectProvisioning,
  provisionDevelopment,
} from './development-provisioning.js';
import type { ProvisioningEntry } from './development-provisioning.js';

export const automaticIdentities = [
  { slot: 'admin', name: 'Admin', email: 'admin.local@helpdesk.test' },
  { slot: 'technician1', name: 'Murilo', email: 'murilo.local@helpdesk.test' },
  {
    slot: 'technician2',
    name: 'Gabriel',
    email: 'gabriel.local@helpdesk.test',
  },
  { slot: 'technician3', name: 'João', email: 'joao.local@helpdesk.test' },
] as const;

export interface CredentialDelivery {
  path: string;
  finish(outcome: 'commit' | 'abort'): Promise<void>;
}
export type PrepareCredentialDelivery = (
  entries: readonly ProvisioningEntry[],
) => Promise<CredentialDelivery>;

export function automaticPlan(): ProvisioningEntry[] {
  const used = new Set<string>();
  return automaticIdentities.map((identity) => {
    let password: string;
    do password = randomBytes(24).toString('base64url');
    while (used.has(password));
    used.add(password);
    return { ...identity, password };
  });
}

export async function provisionAutomatically(
  db: PrismaClient,
  prepareDelivery: PrepareCredentialDelivery,
) {
  // Fail before generating credentials or opening the local file if any account
  // already exists. Never regenerate a password for an existing account.
  const current = await inspectProvisioning(db, automaticIdentities);
  if (current.some((row) => row.exists))
    throw new ApplicationError(
      'PROVISIONING_CONFLICT',
      409,
      'Uma conta do lote já existe. Nenhuma senha será recriada ou substituída.',
    );
  const entries = automaticPlan();
  let delivery: CredentialDelivery | undefined;
  let committed = false;
  try {
    const summary = await provisionDevelopment(db, entries, {
      requireAllNew: true,
      beforeCreate: async () => {
        delivery = await prepareDelivery(entries);
      },
    });
    committed = true;
    await delivery!.finish('commit');
    return { path: delivery!.path, summary };
  } catch (error) {
    if (delivery && !committed) {
      // A lost commit acknowledgement is ambiguous. Delete our new local file
      // only after confirming that every slot is still absent. On uncertainty,
      // retain it with its restricted ACL for local reconciliation.
      let absent = false;
      try {
        absent = (await inspectProvisioning(db, automaticIdentities)).every(
          (row) => !row.exists,
        );
      } catch {
        /* Database unavailable or conflicting identity: retain file. */
      }
      await delivery.finish(absent ? 'abort' : 'commit');
    }
    // Once committed, never remove the credentials or repeat INSERTs because
    // acknowledgement from the local helper failed. Reconcile locally instead.
    throw error;
  } finally {
    for (const entry of entries) entry.password = undefined;
  }
}
