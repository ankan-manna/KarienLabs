import type { Action, Resource } from '@medcommerce/shared';
import { permission } from '@medcommerce/shared';
import type { ReactNode } from 'react';

import { useAuth } from '../../context/AuthContext';

/**
 * UI convenience only — hides actions the user can't take. The real security
 * boundary is the backend `authorize()` middleware; this never substitutes for it.
 */
export function Can({
  I,
  a,
  fallback = null,
  children,
}: {
  I: Action;
  a: Resource;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { user, permissions, isSuperAdmin } = useAuth();
  if (!user) return <>{fallback}</>;
  if (isSuperAdmin || permissions.has(permission(a, I))) return <>{children}</>;
  return <>{fallback}</>;
}
