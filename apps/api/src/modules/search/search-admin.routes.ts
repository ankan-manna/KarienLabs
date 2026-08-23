import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { resolveAnalyticsDateRange } from '../admin/analytics-date-range.util';

import {
  getPopularSearches,
  getSearchSummary,
  getSearchTrend,
  getZeroResultSearches,
} from './search-analytics.service';
import { getSeoConfig, setSeoConfig, type SeoConfig } from './seo-config.service';

/**
 * Part 33/34/35/36/51 — read-only admin search analytics (reusing
 * `RESOURCES.REPORTS`, the exact same permission  22's report/
 * analytics endpoints already gate on) + the search-tunables slice of SEO
 * Configuration (min/max query length, result caps, suggestion limit, cache
 * duration — Part 36), exposed under `/admin/search/*` since that's the
 * more discoverable location for a Platform Admin managing search behavior,
 * even though it's backed by the same `seo` Configuration namespace as
 * `/admin/seo/config`.
 */
export const searchAdminRouter = Router();

searchAdminRouter.use(requireAuth, authorize(permission(RESOURCES.REPORTS, ACTIONS.READ)));

function rangeFromQuery(req: { query: Record<string, unknown> }) {
  return resolveAnalyticsDateRange({
    preset: typeof req.query.preset === 'string' ? req.query.preset : undefined,
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
  });
}

searchAdminRouter.get(
  '/analytics/summary',
  asyncHandler(async (req, res) => sendSuccess(res, await getSearchSummary(rangeFromQuery(req)))),
);

searchAdminRouter.get(
  '/analytics/popular',
  asyncHandler(async (req, res) => sendSuccess(res, await getPopularSearches(rangeFromQuery(req)))),
);

searchAdminRouter.get(
  '/analytics/zero-result',
  asyncHandler(async (req, res) => sendSuccess(res, await getZeroResultSearches(rangeFromQuery(req)))),
);

searchAdminRouter.get(
  '/analytics/trend',
  asyncHandler(async (req, res) => sendSuccess(res, await getSearchTrend(rangeFromQuery(req)))),
);

// Part 36 — search tunables live in the SAME `seo` Configuration namespace
// (seo-config.service.ts), exposed here too for a more discoverable
// "Search Settings" admin screen; writes go through the identical
// validated setSeoConfig path, so there's only ever one write path/one
// source of truth regardless of which admin screen an operator uses.
searchAdminRouter.get(
  '/config',
  authorize(permission(RESOURCES.CONFIGURATION, ACTIONS.READ)),
  asyncHandler(async (_req, res) => sendSuccess(res, await getSeoConfig())),
);
searchAdminRouter.patch(
  '/config',
  authorize(permission(RESOURCES.CONFIGURATION, ACTIONS.UPDATE)),
  asyncHandler(async (req, res) => {
    const partial = req.body as Partial<SeoConfig>;
    return sendSuccess(res, await setSeoConfig(partial, req.user!.id, req.user!.role));
  }),
);
