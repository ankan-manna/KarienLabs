import type { ApiResponse } from '@medcommerce/shared';

import { createCrudApi } from './createCrudApi';
import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export interface NotificationTemplate {
  _id: string;
  key: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'push';
  subject: string;
  body: string;
  isActive: boolean;
}

export const notificationTemplateApi = createCrudApi<NotificationTemplate>(
  '/notifications/templates',
);

export interface NotificationHistoryEntry {
  _id: string;
  channel: string;
  templateKey: string;
  recipient: string;
  status: string;
  orderId?: string | null;
  errorCode?: string;
  sentAt: string;
  isRead?: boolean;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export async function listNotificationHistory(
  params: ListQueryParams,
): Promise<{ items: NotificationHistoryEntry[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<NotificationHistoryEntry[]>>(
    '/notifications/history',
    { params },
  );
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

/** Part 24/39 — re-enqueues a FAILED notification for delivery. */
export async function retryNotification(id: string): Promise<void> {
  const { data } = await httpClient.post<ApiResponse<{ retried: boolean }>>(
    `/notifications/history/${id}/retry`,
  );
  unwrap(data);
}

/** Part 20 — safe mock-data preview, never real data. */
export async function previewTemplate(id: string): Promise<{ subject: string; body: string }> {
  const { data } = await httpClient.post<ApiResponse<{ subject: string; body: string }>>(
    `/notifications/templates/${id}/preview`,
  );
  return unwrap(data);
}

export async function toggleTemplateStatus(id: string, isActive: boolean): Promise<NotificationTemplate> {
  const { data } = await httpClient.patch<ApiResponse<NotificationTemplate>>(
    `/notifications/templates/${id}/status`,
    { isActive },
  );
  return unwrap(data);
}

export interface ProviderHealth {
  email: { configured: boolean; status: string };
  sms: { configured: boolean; status: string };
  whatsapp: { configured: boolean; status: string };
  push: { configured: boolean; status: string };
}

export async function getProviderHealth(): Promise<ProviderHealth> {
  const { data } = await httpClient.get<ApiResponse<ProviderHealth>>('/notifications/providers/health');
  return unwrap(data);
}

export interface NotificationConfig {
  notificationsEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  whatsappEnabled: boolean;
  pushEnabled: boolean;
  orderNotificationsEnabled: boolean;
  paymentNotificationsEnabled: boolean;
  shippingNotificationsEnabled: boolean;
  returnNotificationsEnabled: boolean;
  prescriptionNotificationsEnabled: boolean;
  adminNotificationsEnabled: boolean;
}

export async function getNotificationConfig(): Promise<NotificationConfig> {
  const { data } = await httpClient.get<ApiResponse<NotificationConfig>>('/notifications/config');
  return unwrap(data);
}

export async function setNotificationConfig(
  partial: Partial<NotificationConfig>,
): Promise<NotificationConfig> {
  const { data } = await httpClient.put<ApiResponse<NotificationConfig>>('/notifications/config', partial);
  return unwrap(data);
}

/** Customer-facing — the logged-in user's own notification feed. */
export async function listMyNotifications(
  params: ListQueryParams,
): Promise<{ items: NotificationHistoryEntry[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<NotificationHistoryEntry[]>>(
    '/notifications/mine',
    { params },
  );
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function getUnreadNotificationCount(): Promise<number> {
  const { data } = await httpClient.get<ApiResponse<{ count: number }>>('/notifications/mine/unread-count');
  return unwrap(data).count;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { data } = await httpClient.patch<ApiResponse<{ read: boolean }>>(`/notifications/mine/${id}/read`);
  unwrap(data);
}

export async function markAllNotificationsRead(): Promise<number> {
  const { data } = await httpClient.patch<ApiResponse<{ updated: number }>>('/notifications/mine/read-all');
  return unwrap(data).updated;
}

export async function sendNotification(input: {
  channel: 'email' | 'sms' | 'whatsapp' | 'push';
  templateKey: string;
  recipient: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const { data } = await httpClient.post<ApiResponse<{ queued: boolean }>>(
    '/notifications/send',
    input,
  );
  if (!data.success) throw new Error(data.error.message);
}
