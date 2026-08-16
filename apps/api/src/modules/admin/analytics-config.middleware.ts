import { ROLES } from '@medcommerce/shared';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../utils/app-error';

import { isAnalyticsDomainEnabled } from './analytics-config.service';
import type { AnalyticsConfig } from './analytics-config.util';

/**
 * Prompt 22 Part 2/3/38/46 — backend enforcement of the analytics
 * Configuration toggles, same shape as requireCouponManagementEnabled
 * (Prompt 19) / requireNotificationEnabled (Prompt 20). Super Admin always
 * retains access (otherwise there'd be no way to reach `/admin/analytics-config`
 * to turn a domain back on once disabled — that config route itself is
 * gated by the `reports:update` PERMISSION, not this middleware).
 *
 * `domain` is optional: pass nothing to only enforce the master switch
 * (used for the master dashboard), or a specific `AnalyticsConfig` key to
 * additionally gate one report/analytics domain.
 */
export function requireAnalyticsEnabled(domain?: keyof AnalyticsConfig) {
  return async function analyticsConfigGate(req: Request, _res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.role === ROLES.SUPER_ADMIN) return next();
      if (await isAnalyticsDomainEnabled(domain)) return next();
      next(
        new AppError(
          403,
          'ANALYTICS_FEATURE_DISABLED',
          domain ? `Analytics for "${domain}" is currently disabled` : 'Analytics is currently disabled',
        ),
      );
    } catch (error) {
      next(error);
    }
  };
}
