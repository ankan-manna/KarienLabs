import type { Role } from '@medcommerce/shared';
import jwt from 'jsonwebtoken';

import { env } from '../../config/env';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

/**
 * Prompt 24 Part 18 — explicitly pinned to HS256 on both sign and verify.
 * Not previously exploitable (a string HMAC secret already restricts
 * `jsonwebtoken` to symmetric algorithms; the classic RS256-to-HS256
 * "confused-key" attack needs a PUBLIC key being reused as an HMAC
 * secret, which never happens here since there's no RSA keypair anywhere
 * in this codebase's auth flow) — but pinning it removes any doubt and is
 * the standard defense-in-depth recommendation regardless of current
 * exploitability, and protects against a future refactor accidentally
 * widening the accepted algorithm set.
 */
const JWT_ALGORITHM: jwt.Algorithm = 'HS256';

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    algorithm: JWT_ALGORITHM,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload & jwt.JwtPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [JWT_ALGORITHM],
  }) as AccessTokenPayload & jwt.JwtPayload;
}

export function accessTokenExpiresAt(): string {
  const match = /^(\d+)([smhd])$/.exec(env.JWT_ACCESS_EXPIRES_IN);
  const unitMs: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  const ms = match ? Number(match[1]) * unitMs[match[2]] : 15 * 60_000;
  return new Date(Date.now() + ms).toISOString();
}

/**
 * Short-lived, single-purpose JWTs (Prompt 10) that stand in for a "you've
 * proven step 1, now do step 2" state without needing server-side session
 * storage — same JWT_ACCESS_SECRET/library as the real access token, but a
 * distinct `typ` claim so one can never be presented where the other is
 * expected (e.g. a login-OTP challenge token can't be used as a bearer
 * access token, and vice versa — `requireAuth`'s payload has no `typ` at
 * all, and `verifyChallengeToken` rejects anything without the exact `typ`
 * it's asking for).
 */
export type ChallengeTokenType =
  | 'login_otp_challenge'
  | 'password_reset_session'
  // Prompt 31 — stands in for "registered but not yet email-verified" between
  // register() and verifyRegistrationOtp(); real session tokens are withheld
  // until this is exchanged, same pattern as login_otp_challenge.
  | 'registration_otp_challenge'
  // Prompt 32 — proves a GUEST distributor's email was just OTP-verified,
  // without minting any session/account. `sub` holds the verified email
  // (not a userId — the only challenge type where that's true; see
  // distributor-enquiry.service.ts, which checks `payload.sub` equals the
  // email in the submitted enquiry).
  | 'distributor_enquiry_contact_verified';

export interface ChallengeTokenPayload {
  sub: string; // userId (or, for distributor_enquiry_contact_verified, the verified email)
  typ: ChallengeTokenType;
}

const CHALLENGE_TOKEN_TTL = '10m';

export function signChallengeToken(sub: string, typ: ChallengeTokenType): string {
  return jwt.sign({ sub, typ } satisfies ChallengeTokenPayload, env.JWT_ACCESS_SECRET, {
    expiresIn: CHALLENGE_TOKEN_TTL,
    algorithm: JWT_ALGORITHM,
  });
}

/** Throws (via jsonwebtoken's own errors) on bad signature/expiry; returns null if the token is well-formed and valid but for the wrong `typ`. */
export function verifyChallengeToken(
  token: string,
  expectedType: ChallengeTokenType,
): ChallengeTokenPayload | null {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [JWT_ALGORITHM],
  }) as ChallengeTokenPayload & jwt.JwtPayload;
  if (payload.typ !== expectedType) return null;
  return { sub: payload.sub, typ: payload.typ };
}
