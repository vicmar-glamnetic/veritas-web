import { randomBytes, randomInt } from 'node:crypto';

/**
 * Alphabet with no 0/O, 1/I/L, 5/S, 8/B — patients read these codes over the phone
 * to the front desk.
 */
const ALPHABET = '234679ACDEFGHJKMNPQRTUVWXY';

/** e.g. "VRT-7K4Q". Collisions are retried against the unique index by the caller. */
export function generateReferenceCode(): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return `VRT-${code}`;
}

/** Opaque, single-purpose secret for the emailed cancellation link. */
export function generateCancelToken(): string {
  return randomBytes(24).toString('base64url');
}
