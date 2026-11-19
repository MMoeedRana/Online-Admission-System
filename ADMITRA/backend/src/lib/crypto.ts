import crypto from 'node:crypto';
import argon2 from 'argon2';

/** AUTH-2: passwords are stored only as Argon2id hashes. */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/** Random URL-safe token (e-mail links, refresh tokens). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Tokens are stored only as SHA-256 hashes (SEC-3). */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
