import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function generateOpaqueToken(size = 32): string {
  return randomBytes(size).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function compareOpaqueToken(token: string, tokenHash: string): boolean {
  const providedHash = hashOpaqueToken(token);
  const left = Buffer.from(providedHash, 'utf8');
  const right = Buffer.from(tokenHash, 'utf8');

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
