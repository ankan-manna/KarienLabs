import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { PaginatedMeta } from './types';

export interface ChartPoint {
  date?: string;
  week?: string;
  month?: string;
  revenue?: number;
  orderCount?: number;
  newCustomers?: number;
  categoryName?: string;
  totalQuantity?: number;
  totalValue?: number;
}

export interface DashboardStats {
  todaysRevenue: number;
  todaysOrderCount: number;
  pendingOrderCount: number;
  deliveredOrderCount: number;
  cancelledOrderCount: number;
  refundRequestCount: number;

  lowStockCount: number;
  lowStockItems: Record<string, unknown>[];
  expiringCount: number;
  expiringItems: Record<string, unknown>[];
  outOfStockCount: number;
  pendingPrescriptionCount: number;

  topSellingProducts: { _id: string; name: string; sku: string; quantitySold: number; revenue: number }[];
  topCategories: { categoryId: string | null; categoryName: string; revenue: number; unitsSold: number }[];
  topCustomers: { customerId: string; name: string; email: string; orderCount: number; totalSpent: number }[];

  latestOrders: Record<string, unknown>[];
  latestPayments: Record<string, unknown>[];
  recentActivity: Record<string, unknown>[];
  recentNotifications: Record<string, unknown>[];

  charts: {
    dailySales: ChartPoint[];
    weeklySales: ChartPoint[];
    monthlySales: ChartPoint[];
    revenueGraph: ChartPoint[];
    inventoryGraph: ChartPoint[];
    customerGrowth: ChartPoint[];
  };
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data } = await httpClient.get<ApiResponse<DashboardStats>>('/admin/dashboard');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export interface AuditLogEntry {
  _id: string;
  /** Populated by the API (`name`/`email`) when the actor still exists; `null` for system-initiated actions. */
  actorId: string | { _id: string; name?: string; email?: string } | null;
  action: string;
  resource: string;
  resourceId: string | null;
  before?: unknown;
  after?: unknown;
  createdAt: string;
  // Actor-context fields ( 10 Part 4/5) — optional since every
  // pre--10 row simply doesn't have them set.
  actorType?: string | null;
  actorName?: string;
  actorEmail?: string;
  authenticationMethod?: string;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  result?: string;
  failureReason?: string;
  metadata?: unknown;
}

export interface ActivityLogEntry {
  _id: string;
  actorId: string | null;
  resource: string;
  resourceId: string | null;
  message: string;
  createdAt: string;
}

export async function fetchAuditLogs(params: {
  page: number;
  limit: number;
  filter?: Record<string, string>;
}): Promise<{ items: AuditLogEntry[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<AuditLogEntry[]>>('/admin/audit-logs', {
    params,
  });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function fetchActivityLogs(params: {
  page: number;
  limit: number;
  filter?: Record<string, string>;
}): Promise<{ items: ActivityLogEntry[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<ActivityLogEntry[]>>('/admin/activity-logs', {
    params,
  });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

/** Convenience wrapper for the "Audit History" tab on any entity's detail drawer. */
export function fetchEntityAuditLog(resource: string, resourceId: string) {
  return fetchAuditLogs({ page: 1, limit: 20, filter: { resource, resourceId } });
}

/** Convenience wrapper for the "Activity Timeline" tab on any entity's detail drawer. */
export function fetchEntityActivityLog(resource: string, resourceId: string) {
  return fetchActivityLogs({ page: 1, limit: 20, filter: { resource, resourceId } });
}
