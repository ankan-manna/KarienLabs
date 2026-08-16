import { permission } from '@medcommerce/shared';
import { useMemo } from 'react';

import type { MenuItem } from '../constants/menu';
import { useAuth } from '../context/AuthContext';

import { useFeatureFlag } from './useFeatureFlag';

function isVisible(
  item: MenuItem,
  ctx: { role: string; isSuperAdmin: boolean; permissions: Set<string> },
): boolean {
  if (item.requiredRole && !item.requiredRole.includes(ctx.role as never)) return false;
  if (item.requiredPermission && !ctx.isSuperAdmin) {
    const key = permission(item.requiredPermission.resource, item.requiredPermission.action);
    if (!ctx.permissions.has(key)) return false;
  }
  return true;
}

/** Filters a static menu config by the current user's role + effective permissions. Feature-flag-gated items are filtered separately below since hooks can't run inside a loop/array. */
export function useVisibleMenu(items: MenuItem[]): MenuItem[] {
  const { user, permissions, isSuperAdmin } = useAuth();

  return useMemo(() => {
    if (!user) return [];
    return items.filter((item) => isVisible(item, { role: user.role, isSuperAdmin, permissions }));
  }, [items, user, permissions, isSuperAdmin]);
}

/** For the (currently rare) case a single menu item is gated behind a feature flag. */
export function useMenuItemFlagVisible(item: MenuItem): boolean {
  const enabled = useFeatureFlag(item.requiredFlag ?? '__none__');
  return !item.requiredFlag || enabled;
}
