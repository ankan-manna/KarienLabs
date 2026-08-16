const ADMIN_ROLES = new Set(['admin', 'super_admin', 'inventory_manager']);

/** Where a logged-in user's own profile page lives — the admin panel for staff roles, the customer account area for everyone else. */
export function getProfilePath(role: string | undefined): string {
  return role && ADMIN_ROLES.has(role) ? '/admin/profile' : '/account/profile';
}

/** True for staff roles (admin panel users) — used to hide customer-only nav (e.g. "Home") from the admin variant of shared components. */
export function isStaffRole(role: string | undefined): boolean {
  return !!role && ADMIN_ROLES.has(role);
}
