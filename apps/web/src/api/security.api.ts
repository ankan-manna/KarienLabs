import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export interface BlockedIp {
  _id: string;
  ipAddress: string;
  reason: string;
  blockedBy: string | { _id: string; name?: string; email?: string } | null;
  createdAt: string;
}

export async function listBlockedIps(
  params: ListQueryParams,
): Promise<{ items: BlockedIp[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<BlockedIp[]>>('/security/blocked-ips', {
    params,
  });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function blockIp(input: { ipAddress: string; reason?: string }): Promise<BlockedIp> {
  const { data } = await httpClient.post<ApiResponse<BlockedIp>>('/security/blocked-ips', input);
  return unwrap(data);
}

export async function unblockIp(id: string): Promise<void> {
  await httpClient.delete(`/security/blocked-ips/${id}`);
}

export interface Device {
  _id: string;
  userId: string | { _id: string; name?: string; email?: string } | null;
  deviceId: string;
  platform: 'ios' | 'android' | 'web';
  lastActiveAt: string;
  isActive: boolean;
  isBlocked: boolean;
  blockedReason: string;
}

export async function listDevices(
  params: ListQueryParams,
): Promise<{ items: Device[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<Device[]>>('/security/devices', { params });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function blockDevice(id: string, reason?: string): Promise<Device> {
  const { data } = await httpClient.patch<ApiResponse<Device>>(`/security/devices/${id}/block`, {
    reason,
  });
  return unwrap(data);
}

export async function unblockDevice(id: string): Promise<Device> {
  const { data } = await httpClient.patch<ApiResponse<Device>>(`/security/devices/${id}/unblock`);
  return unwrap(data);
}
