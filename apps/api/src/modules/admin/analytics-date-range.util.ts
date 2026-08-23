import { AppError } from '../../utils/app-error';

/**
 * Part 4/5/43 — the ONE authoritative date-range resolver for
 * every analytics/report endpoint, replacing the ad-hoc `{from?, to?}`
 * optional-string handling previously duplicated (with slightly different
 * behavior — some naive-local-time, some not) across reports.service.ts,
 * analytics.service.ts, and dashboard.service.ts.
 *
 * Two things this fixes for real:
 * 1. Timezone consistency (Part 5) — this project has no project-wide
 *    business timezone configured anywhere (confirmed:  18's
 *    LOG_TIMEZONE defaults to UTC and nothing else in the codebase
 *    references a different zone) — so UTC is the documented, deterministic
 *    choice here, used consistently via `Date.UTC(...)`/`getUTCFullYear()`
 *    etc. rather than mixing `$dateToString` (implicitly UTC on the Mongo
 *    side) with local-server-timezone `setHours()`/`setDate()` JS Date math
 *    (the previous bug: if the Node process ever ran in a non-UTC TZ, the
 *    application-side "start of today" boundary would silently disagree
 *    with the Mongo-side daily grouping).
 * 2. Unbounded-query protection (Part 43) — a `custom` range longer than
 *    `MAX_CUSTOM_RANGE_DAYS` is rejected outright, and no date params at
 *    all resolves to a bounded default (`last30days`), never "all time."
 */

export const DATE_RANGE_PRESETS = [
  'today',
  'yesterday',
  'last7days',
  'last30days',
  'currentMonth',
  'previousMonth',
  'currentYear',
  'previousYear',
  'custom',
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export interface ResolvedDateRange {
  preset: DateRangePreset;
  from: Date;
  to: Date;
}

/** Part 43 — a custom range wider than this is rejected; generous enough for "previous year vs this year" comparisons, bounded enough to stop an unrestricted multi-year full-collection scan. */
const MAX_CUSTOM_RANGE_DAYS = 366;

function utcStartOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
function utcEndOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}
function addUtcDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
function utcStartOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

export interface DateRangeInput {
  preset?: string;
  from?: string;
  to?: string;
}

/**
 * `now` is injectable purely for deterministic unit testing — every real
 * call site uses the default (the actual current time).
 */
export function resolveAnalyticsDateRange(input: DateRangeInput, now: Date = new Date()): ResolvedDateRange {
  const requestedPreset = input.preset as DateRangePreset | undefined;
  const preset: DateRangePreset = requestedPreset ?? (input.from || input.to ? 'custom' : 'last30days');

  if (!DATE_RANGE_PRESETS.includes(preset)) {
    throw new AppError(422, 'INVALID_DATE_RANGE', `Unknown date range preset "${preset}"`);
  }

  switch (preset) {
    case 'today':
      return { preset, from: utcStartOfDay(now), to: utcEndOfDay(now) };
    case 'yesterday': {
      const yesterday = addUtcDays(now, -1);
      return { preset, from: utcStartOfDay(yesterday), to: utcEndOfDay(yesterday) };
    }
    case 'last7days':
      return { preset, from: utcStartOfDay(addUtcDays(now, -6)), to: utcEndOfDay(now) };
    case 'last30days':
      return { preset, from: utcStartOfDay(addUtcDays(now, -29)), to: utcEndOfDay(now) };
    case 'currentMonth':
      return { preset, from: utcStartOfMonth(now), to: utcEndOfDay(now) };
    case 'previousMonth': {
      const firstOfThisMonth = utcStartOfMonth(now);
      const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 1);
      return { preset, from: utcStartOfMonth(lastOfPrevMonth), to: lastOfPrevMonth };
    }
    case 'currentYear':
      return {
        preset,
        from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0)),
        to: utcEndOfDay(now),
      };
    case 'previousYear':
      return {
        preset,
        from: new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1, 0, 0, 0, 0)),
        to: new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999)),
      };
    case 'custom': {
      if (!input.from || !input.to) {
        throw new AppError(422, 'INVALID_DATE_RANGE', 'A custom date range requires both "from" and "to"');
      }
      const from = new Date(input.from);
      const to = new Date(input.to);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new AppError(422, 'INVALID_DATE_RANGE', 'Invalid "from"/"to" date value');
      }
      if (from.getTime() > to.getTime()) {
        throw new AppError(422, 'INVALID_DATE_RANGE', '"from" must be before "to"');
      }
      const rangeDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
      if (rangeDays > MAX_CUSTOM_RANGE_DAYS) {
        throw new AppError(
          422,
          'INVALID_DATE_RANGE',
          `Custom date range cannot exceed ${MAX_CUSTOM_RANGE_DAYS} days`,
        );
      }
      return { preset, from, to };
    }
  }
}

/** The Mongo `$match` fragment for a resolved range — always both bounds, never an unbounded query. */
export function dateRangeMatchStage(range: ResolvedDateRange, field = 'createdAt'): Record<string, unknown> {
  return { [field]: { $gte: range.from, $lte: range.to } };
}
