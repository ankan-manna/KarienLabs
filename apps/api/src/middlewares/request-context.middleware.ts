import type { NextFunction, Request, Response } from 'express';

import { env } from '../config/env';
import { runWithRequestContext } from '../config/request-context';

/**
 * Part 4/5/6 — mounted immediately after `requestId` (app.ts), so
 * `req.requestId` is already assigned. Wraps the ENTIRE remainder of the
 * middleware/route chain in one AsyncLocalStorage scope; `requireAuth`
 * later fills in `actorId`/`actorType`/`role` on this SAME context object
 * once the JWT is verified (see auth.middleware.ts). Non-blocking — this is
 * just a synchronous closure wrap around `next()`, no I/O.
 */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  runWithRequestContext(
    {
      requestId: req.requestId,
      tenant: env.TENANT_CODE,
    },
    next,
  );
}
