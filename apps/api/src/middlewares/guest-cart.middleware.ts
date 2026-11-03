import { randomBytes } from 'crypto';

import type { CookieOptions, NextFunction, Request, Response } from 'express';

import { isProduction } from '../config/env';

/** Guest-cart identity cookie — holds only a random, server-issued id (never
 * a client-supplied value), the same "opaque token as the secret" pattern
 * the refresh-token cookie already uses. Scoped to `/api/v1` (not just
 * `/cart`) because the login/register merge step on the auth routes needs
 * to read it too. */
export const GUEST_CART_COOKIE_NAME = 'mc_guest_cart';

const GUEST_CART_ID_PATTERN = /^[a-f0-9]{48}$/;

export const GUEST_CART_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/api/v1',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30d — matches the Cart model's own abandoned-guest-cart TTL index
};

declare module 'express-serve-static-core' {
  interface Request {
    guestCartId?: string;
  }
}

/**
 * Must run after `optionalAuth`. Authenticated requests are left alone
 * (owner key is `userId`, no guest id needed). Anonymous requests get a
 * `req.guestCartId`, reusing an existing valid cookie or issuing a fresh
 * cryptographically random one. A malformed/tampered cookie value (wrong
 * shape) is treated as "no cookie" and silently replaced — it is never used
 * as a lookup key as-is, so a guessed value can't be used to probe for
 * someone else's cart.
 */
export function guestCartIdentity(req: Request, res: Response, next: NextFunction) {
  if (req.user) return next();

  const existing = req.cookies?.[GUEST_CART_COOKIE_NAME];
  if (typeof existing === 'string' && GUEST_CART_ID_PATTERN.test(existing)) {
    req.guestCartId = existing;
    return next();
  }

  const fresh = randomBytes(24).toString('hex');
  req.guestCartId = fresh;
  res.cookie(GUEST_CART_COOKIE_NAME, fresh, GUEST_CART_COOKIE_OPTIONS);
  next();
}
