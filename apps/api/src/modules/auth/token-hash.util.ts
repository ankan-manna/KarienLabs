import { createHash, timingSafeEqual } from 'crypto';

/**
 * SHA-256 hash for opaque bearer secrets we need to look up by exact match
 * (refresh tokens, email-verification/password-reset link tokens, OTP codes).
 * Extracted from auth.service.ts (Prompt 1-9) so otp.service.ts (Prompt 10)
 * can reuse it instead of redefining the same function — not bcrypt, by
 * design: these are high-entropy random tokens or rate-limited/short-TTL OTP
 * codes looked up by hash equality, not low-entropy user-chosen passwords
 * that need to resist offline dictionary attack, so bcrypt's deliberate
 * slowness buys nothing here and costs latency on every request.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Constant-time hash comparison — avoids a timing side-channel on OTP/token verification (a naive `===` short-circuits on the first differing byte). */
export function hashesMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
