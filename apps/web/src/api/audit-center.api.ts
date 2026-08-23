import type { AuditLogEntry } from './admin.api';
import { fetchAuditLogs } from './admin.api';
import type { PaginatedMeta } from './types';

export type { AuditLogEntry } from './admin.api';

export const AUDIT_RESOURCES = [
  'order',
  'return',
  'purchase_order',
  'purchase_request',
  'grn',
  'refund',
  'role',
  'admin_user',
  'configuration',
  'user',
   // every login/OTP/Google/password-reset/session event.
  'auth',
   // Seller entity + warehouse ownership changes + the one-time backfill migration.
  'seller',
  'warehouse',
  'seller_migration',
] as const;

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'config_change',
  'export',
  'import',
  // authentication events (packages/shared/src/constants/auth-events.ts).
  'login_attempt',
  'login_success',
  'login_failed',
  'otp_generated',
  'otp_verified',
  'otp_failed',
  'otp_expired',
  'otp_resend',
  'password_reset_requested',
  'password_reset_success',
  'password_reset_failed',
  'google_login_success',
  'google_login_failed',
  'token_refresh',
  'session_revoked',
  'account_locked',
  'account_unlocked',
] as const;

export interface AuditLogFilters {
  resource?: string;
  actorId?: string;
  action?: string;
  from?: string;
  to?: string;
}

/**
 * Full-page audit browser client — thin wrapper around admin.api.ts's
 * `fetchAuditLogs` (used elsewhere for the per-entity drawer's "Audit
 * History" tab) that builds the `filter[...]` query object the Audit Center
 * page's filter bar needs, including a date-range filter the drawer's
 * narrower use case never needed.
 */
export function listAuditLogs(params: {
  page: number;
  limit: number;
  filters?: AuditLogFilters;
}): Promise<{ items: AuditLogEntry[]; meta: PaginatedMeta }> {
  const { resource, actorId, action, from, to } = params.filters ?? {};
  const filter: Record<string, string> = {};
  if (resource) filter.resource = resource;
  if (actorId) filter.actorId = actorId;
  if (action) filter.action = action;
  if (from) filter.dateFrom = from;
  if (to) filter.dateTo = to;

  return fetchAuditLogs({ page: params.page, limit: params.limit, filter });
}
