import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export interface FeatureFlag {
  _id: string;
  key: string;
  enabled: boolean;
  scope: 'global' | 'role' | 'user';
  targetRoles: string[];
  targetUserIds: string[];
  rolloutPercentage: number;
}

export interface FeatureFlagInput {
  key: string;
  enabled?: boolean;
  scope?: 'global' | 'role' | 'user';
  targetRoles?: string[];
  targetUserIds?: string[];
  rolloutPercentage?: number;
}

export type FeatureFlagPatch = Partial<Omit<FeatureFlagInput, 'key'>>;

export async function listFeatureFlags(): Promise<FeatureFlag[]> {
  const { data } = await httpClient.get<ApiResponse<FeatureFlag[]>>('/feature-flags');
  return unwrap(data);
}

export async function createFeatureFlag(input: FeatureFlagInput): Promise<FeatureFlag> {
  const { data } = await httpClient.post<ApiResponse<FeatureFlag>>('/feature-flags', input);
  return unwrap(data);
}

export async function setFeatureFlagEnabled(key: string, enabled: boolean): Promise<FeatureFlag> {
  const { data } = await httpClient.patch<ApiResponse<FeatureFlag>>(`/feature-flags/${key}`, {
    enabled,
  });
  return unwrap(data);
}

export async function updateFeatureFlag(
  key: string,
  patch: FeatureFlagPatch,
): Promise<FeatureFlag> {
  const { data } = await httpClient.patch<ApiResponse<FeatureFlag>>(`/feature-flags/${key}`, patch);
  return unwrap(data);
}

export async function deleteFeatureFlag(key: string): Promise<void> {
  await httpClient.delete(`/feature-flags/${key}`);
}

export interface PermissionCatalogEntry {
  key: string;
  resource: string;
  action: string;
}

export async function listPermissionCatalog(): Promise<PermissionCatalogEntry[]> {
  const { data } =
    await httpClient.get<ApiResponse<PermissionCatalogEntry[]>>('/admin/rbac/permissions');
  return unwrap(data);
}

export interface Role {
  _id: string;
  key: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
}

export async function listRoles(): Promise<Role[]> {
  const { data } = await httpClient.get<ApiResponse<Role[]>>('/admin/rbac/roles');
  return unwrap(data);
}

export async function updateRolePermissions(key: string, permissions: string[]): Promise<Role> {
  const { data } = await httpClient.put<ApiResponse<Role>>(`/admin/rbac/roles/${key}/permissions`, {
    permissions,
  });
  return unwrap(data);
}

export async function cloneRole(
  sourceKey: string,
  input: { key: string; name: string },
): Promise<Role> {
  const { data } = await httpClient.post<ApiResponse<Role>>(
    `/admin/rbac/roles/${sourceKey}/clone`,
    input,
  );
  return unwrap(data);
}

/** Used by RolesPage's Import feature — same endpoint the initial role-seed/onboarding flow would use. */
export async function createRole(input: {
  key: string;
  name: string;
  permissions?: string[];
}): Promise<Role> {
  const { data } = await httpClient.post<ApiResponse<Role>>('/admin/rbac/roles', input);
  return unwrap(data);
}

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  isSuspended: boolean;
  suspendedReason?: string;
}

export async function listAdminUsers(params: { page: number; limit: number; role?: string }) {
  const { page, limit, role } = params;
  const { data } = await httpClient.get<ApiResponse<AdminUser[]>>('/admin/rbac/users', {
    params: { page, limit, ...(role ? { filter: { role } } : {}) },
  });
  if (!data.success) throw new Error(data.error.message);
  return data;
}

/** Super-Admin-only (`users:update`, same gate as every other endpoint in this file) — used by the Distributor Enquiry detail drawer to show a linked registered account's current role before offering to change it. */
export async function getAdminUser(id: string): Promise<AdminUser> {
  const { data } = await httpClient.get<ApiResponse<AdminUser>>(`/admin/rbac/users/${id}`);
  return unwrap(data);
}

export async function createAdminUser(input: {
  name: string;
  email: string;
  password: string;
  role: string;
}) {
  const { data } = await httpClient.post<ApiResponse<AdminUser>>('/admin/rbac/users', input);
  return unwrap(data);
}

export async function updateAdminUser(id: string, patch: { role?: string; isActive?: boolean }) {
  const { data } = await httpClient.patch<ApiResponse<AdminUser>>(`/admin/rbac/users/${id}`, patch);
  return unwrap(data);
}

export async function suspendUser(id: string, reason?: string): Promise<AdminUser> {
  const { data } = await httpClient.post<ApiResponse<AdminUser>>(
    `/admin/rbac/users/${id}/suspend`,
    { reason },
  );
  return unwrap(data);
}

export async function unsuspendUser(id: string): Promise<AdminUser> {
  const { data } = await httpClient.post<ApiResponse<AdminUser>>(
    `/admin/rbac/users/${id}/unsuspend`,
  );
  return unwrap(data);
}

export async function resetUserPassword(id: string, newPassword: string): Promise<AdminUser> {
  const { data } = await httpClient.post<ApiResponse<AdminUser>>(
    `/admin/rbac/users/${id}/reset-password`,
    { newPassword },
  );
  return unwrap(data);
}

export async function getConfiguration(namespace: string): Promise<Record<string, unknown>> {
  const { data } = await httpClient.get<ApiResponse<Record<string, unknown>>>(
    `/configuration/${namespace}`,
  );
  return unwrap(data);
}

export async function setConfiguration(namespace: string, value: Record<string, unknown>) {
  const { data } = await httpClient.put<ApiResponse<Record<string, unknown>>>(
    `/configuration/${namespace}`,
    {
      value,
    },
  );
  return unwrap(data);
}
