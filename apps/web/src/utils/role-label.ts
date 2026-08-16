/**
 * Human-readable labels for `Role` values — reused wherever a role is shown
 * to an admin (Topbar profile menu, Profile page, User Management). The
 * business/UI term "Platform Admin" (used throughout docs/ADMIN_USER_GUIDE.md)
 * maps to the `admin` role; the underlying source of truth is always the
 * backend-supplied `role` string, never guessed from this label.
 */
const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Platform Admin',
  inventory_manager: 'Inventory Manager',
  customer: 'Customer',
  distributor: 'Distributor',
};

export function roleLabel(role: string | undefined): string {
  if (!role) return '';
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ');
}
