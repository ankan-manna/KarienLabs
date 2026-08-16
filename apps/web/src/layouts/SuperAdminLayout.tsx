import { AdminLayout } from './AdminLayout';

/**
 * Visually identical to AdminLayout — the sidebar already role-filters the
 * "Platform" section to super_admin (see constants/menu.ts). This wrapper
 * exists so super-admin-only routes can be grouped distinctly in AppRouter.
 */
export function SuperAdminLayout() {
  return <AdminLayout />;
}
