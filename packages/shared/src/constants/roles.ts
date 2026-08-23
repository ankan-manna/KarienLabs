export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  INVENTORY_MANAGER: 'inventory_manager',
  CUSTOMER: 'customer',

  // bulk-purchase business, distinct from the admin-panel roles above. Not
  // an admin-panel role (never added to auth/actor-context.util.ts's
  // ADMIN_ROLES list) — a distributor keeps ordinary storefront/account
  // access and additionally connects to the existing Distributor/Bulk
  // Purchase enquiry workflow (see distributor-enquiry.routes.ts's
  // `GET /me`), never a separate distributor-specific system.
  DISTRIBUTOR: 'distributor',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const DEFAULT_ROLES: Role[] = Object.values(ROLES);
