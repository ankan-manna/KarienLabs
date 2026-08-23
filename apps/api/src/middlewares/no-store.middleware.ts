import type { NextFunction, Request, Response } from 'express';

/**
 * Part 62 — "sensitive responses must not be cached by browsers/
 * proxies." Rather than hand-picking which of the ~150 routes in this API
 * count as "sensitive" (auth, payments, admin, prescriptions, invoices...
 * — in practice nearly everything), this applies `Cache-Control: no-store`
 * to the ENTIRE `/api/v1` JSON API uniformly: every response here is
 * dynamic, per-actor data, and there is no legitimate reason for an
 * intermediate proxy or browser bfcache to retain any of it. Static,
 * genuinely cacheable assets (product images, the built frontend bundle)
 * are served from Cloudinary/S3/the web app's own static hosting, never
 * from this API — so a blanket policy here has no caching-benefit
 * downside to weigh against the security upside.
 */
export function noStoreMiddleware(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}
