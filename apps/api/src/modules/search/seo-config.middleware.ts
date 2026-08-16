import { ROLES } from '@medcommerce/shared';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../utils/app-error';

import { isSeoDomainEnabled } from './seo-config.service';
import type { SeoConfig } from './seo-config.util';

/**
 * Prompt 23 Part 2/17/49 — backend enforcement of the SEO Configuration
 * toggles, same shape as requireAnalyticsEnabled (Prompt 22) /
 * requireCouponManagementEnabled (Prompt 19). Super Admin always retains
 * access (otherwise there'd be no way to reach `/admin/seo/config` to turn a
 * domain back on once disabled — that config route itself is gated by the
 * `configuration:update` PERMISSION, not this middleware).
 *
 * "Noindex is NOT authorization" (Part 45/49) — this middleware makes a
 * disabled SEO surface (sitemap.xml, robots.txt, structured data) actually
 * REJECT the request server-side, not just omit a meta tag client-side.
 */
export function requireSeoEnabled(domain?: keyof SeoConfig) {
  return async function seoConfigGate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.role === ROLES.SUPER_ADMIN) return next();
      if (await isSeoDomainEnabled(domain)) return next();
      next(
        new AppError(
          403,
          'SEO_FEATURE_DISABLED',
          domain ? `SEO feature "${domain}" is currently disabled` : 'SEO is currently disabled',
        ),
      );
    } catch (error) {
      next(error);
    }
  };
}
