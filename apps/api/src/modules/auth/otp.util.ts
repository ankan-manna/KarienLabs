import { randomInt } from 'crypto';

/**
 * Cryptographically secure fixed-length numeric OTP via Node's `crypto.randomInt`
 * (CSPRNG-backed) — never `Math.random()`, which is not suitable for security
 * tokens. Zero-padded so e.g. length=6 always yields "000452", not "452".
 */
export function generateOtpCode(length: number): string {
  const max = 10 ** length;
  const code = randomInt(0, max);
  return code.toString().padStart(length, '0');
}
