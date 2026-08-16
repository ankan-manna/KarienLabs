import { resolveAnalyticsDateRange, dateRangeMatchStage, type ResolvedDateRange } from '../admin/analytics-date-range.util';

import { SearchLogModel } from './models/search-log.model';

/**
 * Prompt 23 Part 33/34/35 — search analytics, built as a thin extra report
 * type reusing Prompt 22's existing analytics date-range resolver (the
 * "integrate with the existing admin analytics module" requirement) rather
 * than inventing a second, parallel date-handling scheme. Read-only by
 * design (Part 35: "analytics/search data is primarily read-only... do not
 * create meaningless CRUD").
 */
export type SearchAnalyticsRange = ResolvedDateRange;
export { resolveAnalyticsDateRange };

/** Part 33 — top searched terms (by request volume) within a range, split by whether they returned results. */
export async function getPopularSearches(range: SearchAnalyticsRange, limit = 20) {
  return SearchLogModel.aggregate([
    { $match: dateRangeMatchStage(range) },
    {
      $group: {
        _id: '$normalizedQuery',
        count: { $sum: 1 },
        hasResults: { $max: '$hasResults' },
        avgResultCount: { $avg: '$resultCount' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { _id: 0, query: '$_id', count: 1, hasResults: 1, avgResultCount: 1 } },
  ]);
}

/** Part 34 — zero-result searches, the actionable "catalog/search-config gap" signal. */
export async function getZeroResultSearches(range: SearchAnalyticsRange, limit = 50) {
  return SearchLogModel.aggregate([
    { $match: { ...dateRangeMatchStage(range), hasResults: false } },
    { $group: { _id: '$normalizedQuery', count: { $sum: 1 }, lastSeenAt: { $max: '$createdAt' } } },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { _id: 0, query: '$_id', count: 1, lastSeenAt: 1 } },
  ]);
}

/** Daily search-volume time series, for the admin trend chart. */
export async function getSearchTrend(range: SearchAnalyticsRange) {
  const rows = await SearchLogModel.aggregate([
    { $match: dateRangeMatchStage(range) },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
        totalSearches: { $sum: 1 },
        zeroResultSearches: { $sum: { $cond: [{ $eq: ['$hasResults', false] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ date: r._id, totalSearches: r.totalSearches, zeroResultSearches: r.zeroResultSearches }));
}

/** Overall summary counts for the analytics screen's header cards. */
export async function getSearchSummary(range: SearchAnalyticsRange) {
  const [totals] = await SearchLogModel.aggregate([
    { $match: dateRangeMatchStage(range) },
    {
      $group: {
        _id: null,
        totalSearches: { $sum: 1 },
        zeroResultSearches: { $sum: { $cond: [{ $eq: ['$hasResults', false] }, 1, 0] } },
        distinctQueries: { $addToSet: '$normalizedQuery' },
      },
    },
    { $project: { _id: 0, totalSearches: 1, zeroResultSearches: 1, distinctQueryCount: { $size: '$distinctQueries' } } },
  ]);

  return (
    totals ?? {
      totalSearches: 0,
      zeroResultSearches: 0,
      distinctQueryCount: 0,
    }
  );
}
