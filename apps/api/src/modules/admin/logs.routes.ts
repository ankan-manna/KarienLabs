import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import { requireAnalyticsEnabled } from './analytics-config.middleware';
import {
  getDashboardStatsHandler,
  getPlatformHealthStatsHandler,
  listActivityLogsHandler,
  listAuditLogsHandler,
} from './logs.controller';

export const adminRouter = Router();

adminRouter.use(requireAuth, authorize(permission(RESOURCES.REPORTS, ACTIONS.READ)));

adminRouter.get('/dashboard', requireAnalyticsEnabled(), getDashboardStatsHandler);
// Part 37/38 — platform-operations internals (DB/queue health,
// memory, security alerts) are materially more sensitive than an ordinary
// sales/order report, so beyond the shared `reports:read` permission gate
// above, this ALSO requires the dedicated `platformHealthAnalyticsEnabled`
// Configuration toggle — defaulted OFF (see analytics-config.util.ts) so a
// Super Admin opts a Platform Admin into it explicitly per-deployment,
// rather than every `reports:read` holder seeing it by default.
adminRouter.get(
  '/platform-health',
  requireAnalyticsEnabled('platformHealthAnalyticsEnabled'),
  getPlatformHealthStatsHandler,
);
adminRouter.get(
  '/audit-logs',
  authorize(permission(RESOURCES.AUDIT_LOGS, ACTIONS.READ)),
  validate(listQuerySchema, 'query'),
  listAuditLogsHandler,
);
adminRouter.get(
  '/activity-logs',
  authorize(permission(RESOURCES.AUDIT_LOGS, ACTIONS.READ)),
  validate(listQuerySchema, 'query'),
  listActivityLogsHandler,
);
