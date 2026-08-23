import { timingSafeEqual } from 'crypto';

/**
 * Part 34 — constant-time string comparison for secrets/signatures
 * (webhook tokens, HMAC signatures). A plain `a !== b` leaks timing
 * information proportional to how many leading characters match, which is
 * a real (if slow) attack against static shared secrets. Extracted from
 * `razorpay.service.ts`'s original private `safeCompare` so the Shiprocket
 * webhook token check (webhook.routes.ts) can use the same primitive
 * instead of a bare `!==`, rather than duplicating the logic.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
