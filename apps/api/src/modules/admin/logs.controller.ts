import { sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';
import { ActivityLogModel } from '../audit/models/activity-log.model';
import { AuditLogModel } from '../audit/models/audit-log.model';

import * as dashboardService from './dashboard.service';

export const getDashboardStatsHandler = asyncHandler(async (_req, res) => {
  return sendSuccess(res, await dashboardService.getDashboardStats());
});

export const getPlatformHealthStatsHandler = asyncHandler(async (_req, res) => {
  return sendSuccess(res, await dashboardService.getPlatformHealthStats());
});

export const listAuditLogsHandler = asyncHandler(async (req, res) => {
  const { page, limit, filter } = req.query as unknown as ListQuery;
  const skip = (page - 1) * limit;

  // `dateFrom`/`dateTo` aren't real AuditLog fields — they're the Audit
  // Center page's date-range filter, translated here into a `createdAt`
  // range query since the generic `filter[key]=value` passthrough only
  // supports equality.
  const { dateFrom, dateTo, ...rest } = filter as Record<string, string>;
  const mongoFilter: Record<string, unknown> = { ...rest };
  if (dateFrom || dateTo) {
    mongoFilter.createdAt = {
      ...(dateFrom ? { $gte: new Date(dateFrom) } : {}),
      ...(dateTo ? { $lte: new Date(dateTo) } : {}),
    };
  }

  const [items, total] = await Promise.all([
    AuditLogModel.find(mongoFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actorId', 'name email')
      .lean(),
    AuditLogModel.countDocuments(mongoFilter),
  ]);

  return sendPaginated(res, items, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

export const listActivityLogsHandler = asyncHandler(async (req, res) => {
  const { page, limit, filter } = req.query as unknown as ListQuery;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    ActivityLogModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ActivityLogModel.countDocuments(filter),
  ]);

  return sendPaginated(res, items, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});
