import type { Role } from '@medcommerce/shared';
import type { NextFunction, Request, Response } from 'express';

import { updateRequestContext } from '../config/request-context';
import { verifyAccessToken } from '../modules/auth/jwt.util';
import { UnauthenticatedError } from '../utils/app-error';

import { isAccountUsable } from './rbac.middleware';

export interface AuthContext {
  id: string;
  role: Role;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthContext;
  }
}

/**
 * Verifies the Bearer access token and attaches `{ id, role }` to `req.user`.
 *
 * Part 63 — also re-checks the account's CURRENT active/suspended
 * state (Redis-cached, 60s TTL, same pattern as the role-permission cache
 * in rbac.middleware.ts) rather than trusting the JWT's embedded role for
 * its full unexpired lifetime unconditionally. Closes the window where a
 * just-suspended/deactivated account could keep using an already-issued
 * access token — previously bounded only by the token's 15-minute TTL, now
 * bounded by the 60-second cache TTL instead (refresh tokens were already
 * revoked immediately on suspend via `logoutAllSessions`; this closes the
 * matching gap on the access-token side).
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(new UnauthenticatedError('Missing bearer token'));
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = verifyAccessToken(token);

    if (!(await isAccountUsable(payload.sub))) {
      return next(new UnauthenticatedError('Account is no longer active'));
    }

    req.user = { id: payload.sub, role: payload.role };
    // Part 32 — fills in the SAME request-log-context object the
    // requestId is already sitting on, so every log line from here on
    // (controller/service/payment/inventory/etc.) carries actor identity
    // too, without any of those call sites needing to accept/pass it.
    updateRequestContext({ actorId: payload.sub, actorType: 'user', role: payload.role });
    next();
  } catch {
    next(new UnauthenticatedError('Invalid or expired access token'));
  }
}

/**
 * Same decode as `requireAuth`, but never rejects the request — attaches
 * `req.user` when a valid Bearer token is present, otherwise leaves it
 * undefined and continues. For endpoints that are genuinely public but behave
 * better with identity when it's available (e.g. role/user-scoped feature
 * flag evaluation on `/feature-flags/active`, which anonymous visitors must
 * still be able to call).
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();

  try {
    const payload = verifyAccessToken(header.slice('Bearer '.length));
    req.user = { id: payload.sub, role: payload.role };
    updateRequestContext({ actorId: payload.sub, actorType: 'user', role: payload.role });
  } catch {
    // Invalid/expired token on an optional-auth route — proceed anonymously
    // rather than rejecting, since the route doesn't require authentication.
  }
  next();
}
