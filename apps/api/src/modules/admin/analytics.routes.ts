import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import { requireAnalyticsEnabled } from './analytics-config.middleware';
import { resolveAnalyticsDateRange, type ResolvedDateRange } from './analytics-date-range.util';
import * as analyticsService from './analytics.service';

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, authorize(permission(RESOURCES.REPORTS, ACTIONS.READ)));

/** Part 4/5/43 — same shared, UTC-consistent, abuse-protected resolver as reports.routes.ts; here the safe no-params default is `last30days` (unchanged behavior for callers already relying on the old 30-day default). */
function rangeFromQuery(req: { query: Record<string, unknown> }): ResolvedDateRange {
  return resolveAnalyticsDateRange({
    preset: typeof req.query.preset === 'string' ? req.query.preset : undefined,
    from: typeof req.query.from === 'string' ? req.query.from : undefined,
    to: typeof req.query.to === 'string' ? req.query.to : undefined,
  });
}

analyticsRouter.get(
  '/dashboard',
  requireAnalyticsEnabled(),
  asyncHandler(async (_req, res) => sendSuccess(res, await analyticsService.dashboardSnapshot())),
);

analyticsRouter.get(
  '/top-medicines',
  requireAnalyticsEnabled('productAnalyticsEnabled'),
  asyncHandler(async (req, res) => sendSuccess(res, await analyticsService.topMedicines(rangeFromQuery(req)))),
);

analyticsRouter.get(
  '/low-stock',
  requireAnalyticsEnabled('inventoryAnalyticsEnabled'),
  asyncHandler(async (_req, res) => sendSuccess(res, await analyticsService.lowStockAlerts())),
);

analyticsRouter.get(
  '/top-suppliers',
  requireAnalyticsEnabled('inventoryAnalyticsEnabled'),
  asyncHandler(async (req, res) => sendSuccess(res, await analyticsService.topSuppliers(rangeFromQuery(req)))),
);

analyticsRouter.get(
  '/revenue-trend',
  requireAnalyticsEnabled('salesAnalyticsEnabled'),
  asyncHandler(async (req, res) => {
    const period = req.query.period === 'monthly' ? 'monthly' : 'daily';
    return sendSuccess(res, await analyticsService.revenueTrend(rangeFromQuery(req), period));
  }),
);

analyticsRouter.get(
  '/customer-insights',
  requireAnalyticsEnabled('customerAnalyticsEnabled'),
  asyncHandler(async (_req, res) => sendSuccess(res, await analyticsService.customerInsights())),
);

/** Part 22/40 — Distributor/Bulk Purchase enquiry KPIs for the Analytics page (status breakdown, conversion rate, top requested SKUs). Read-only; never converts an enquiry into an order. */
analyticsRouter.get(
  '/distributor-enquiries',
  requireAnalyticsEnabled('distributorAnalyticsEnabled'),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await analyticsService.distributorEnquirySummary(rangeFromQuery(req))),
  ),
);
