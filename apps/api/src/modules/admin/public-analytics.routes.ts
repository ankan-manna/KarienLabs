import { Router } from 'express';

import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import { getPublicAnalyticsConfig } from './analytics-config.service';

/**
 * Part 13/14/19 — anonymous-readable so the storefront's GA4
 * loader (apps/web/src/lib/analytics.ts) can check, before the customer
 * has logged in at all, whether a Super Admin has actually turned Google
 * Analytics on server-side. Same pattern as public-cms.routes.ts: a
 * bespoke public router, separate from the auth-gated analytics.routes.ts.
 */
export const publicAnalyticsRouter = Router();

publicAnalyticsRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    const config = await getPublicAnalyticsConfig();
    return sendSuccess(res, config);
  }),
);
