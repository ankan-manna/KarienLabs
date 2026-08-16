import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

export interface QueueHealth {
  name: string;
  failed: number;
  active: number;
  waiting: number;
  completed: number;
  error?: string;
}

export interface PlatformHealthStats {
  platformHealth: {
    apiStatus: string;
    databaseStatus: string;
    serverUptimeSeconds: number;
    memoryUsageMb: number;
  };
  totalTenants: number;
  totalPlatformAdmins: number;
  totalCustomers: number;
  totalOrders: number;
  totalRevenue: number;
  activeSessions: number;
  onlineUsers: number;
  queues: QueueHealth[];
  failedJobs: number;
  notificationQueue: { queued: number; failed: number };
  auditSummary: Record<string, number>;
  securityAlerts: number;
}

export async function fetchPlatformHealth(): Promise<PlatformHealthStats> {
  const { data } = await httpClient.get<ApiResponse<PlatformHealthStats>>('/admin/platform-health');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
