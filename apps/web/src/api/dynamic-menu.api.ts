import type { ApiResponse } from '@medcommerce/shared';

import { createCrudApi } from './createCrudApi';
import { httpClient } from './http-client';

export interface DynamicMenuItem {
  _id: string;
  key: string;
  label: string;
  icon: string;
  path: string;
  placement: 'sidebar' | 'topnav';
  parentId: string | null;
  order: number;
  requiredPermission: string | null;
  requiredRole: string | null;
  requiredFeatureFlag: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DynamicMenuTreeNode extends DynamicMenuItem {
  children: DynamicMenuTreeNode[];
}

export interface ReorderItem {
  id: string;
  order: number;
}

export interface ReorderResult {
  requested: number;
  succeeded: number;
  failed: number;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

/**
 * Base CRUD (list/get/create/update/remove/bulkDelete/bulkEdit) reuses the standard
 * `createCrudApi` factory so it plugs straight into `createCrudHooks`/`ConfigEntityPage`
 * like every other admin config module — `list` on `/dynamic-menu` doubles as the
 * "other menu entries" source for the parent-picker select on the admin page.
 */
export const dynamicMenuApi = {
  ...createCrudApi<DynamicMenuItem>('/dynamic-menu'),

  async getTree(placement?: 'sidebar' | 'topnav'): Promise<DynamicMenuTreeNode[]> {
    const { data } = await httpClient.get<ApiResponse<DynamicMenuTreeNode[]>>('/dynamic-menu/tree', {
      params: placement ? { placement } : undefined,
    });
    return unwrap(data);
  },

  async reorder(items: ReorderItem[]): Promise<ReorderResult> {
    const { data } = await httpClient.post<ApiResponse<ReorderResult>>('/dynamic-menu/reorder', {
      items,
    });
    return unwrap(data);
  },
};
