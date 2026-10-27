import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export const argonOptions = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} satisfies argon2.HashOptions;
export function hashPassword(password: string) {
  return argon2.hash(password, argonOptions);
}
export class Passwords {
  private dummy = hashPassword(randomBytes(32).toString('base64url'));
  async verify(hash: string | undefined, password: string) {
    try {
      return (
        (await argon2.verify(hash ?? (await this.dummy), password)) &&
        hash !== undefined
      );
    } catch {
      await argon2.verify(await this.dummy, password);
      return false;
    }
  }
}
