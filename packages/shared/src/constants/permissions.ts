/**
 * Permissions are `resource:action` pairs. Roles are data (stored in Mongo);
 * this list is the canonical vocabulary both the seed script and the frontend
 * `<Can />` component draw from, so typos fail at compile time, not at runtime.
 */
export const RESOURCES = {
  PRODUCTS: 'products',
  CATEGORIES: 'categories',
  BRANDS: 'brands',
  MANUFACTURERS: 'manufacturers',
  ORDERS: 'orders',
  INVENTORY: 'inventory',
  WAREHOUSES: 'warehouses',
  BATCHES: 'batches',
  SUPPLIERS: 'suppliers',
  PURCHASE_ORDERS: 'purchase_orders',
  CUSTOMERS: 'customers',
  COUPONS: 'coupons',
  INVOICES: 'invoices',
  PAYMENTS: 'payments',
  DELIVERIES: 'deliveries',
  SHIPPING: 'shipping',
  TAX: 'tax',
  CMS: 'cms',
  ROLES: 'roles',
  USERS: 'users',
  CONFIGURATION: 'configuration',
  FEATURE_FLAGS: 'feature_flags',
  MENUS: 'menus',
  REPORTS: 'reports',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'audit_logs',
  FILES: 'files',
  REVIEWS: 'reviews',
  // Prompt 11 — Seller entity (legal/business entity distinct from Supplier/Vendor/Warehouse).
  SELLERS: 'sellers',
  // Prompt 12 — Bundle/combo-pack admin CRUD (bundle wraps an existing Product, but has its own admin section/permission).
  BUNDLES: 'bundles',
  // Prompt 16 — Return/Replacement/Refund workflow. Previously piggybacked on
  // RESOURCES.ORDERS + ACTIONS.APPROVE; given its own resource so seller-scoped
  // and Platform-Admin-vs-Super-Admin visibility can be controlled independently
  // of general order permissions (Part 35/36) — still the same RBAC engine,
  // just a new resource value like SELLERS/BUNDLES were before it.
  RETURNS: 'returns',
  // Prompt 17 — prescription review workflow. Previously piggybacked on
  // RESOURCES.CUSTOMERS + ACTIONS.APPROVE; given its own resource for the
  // same reason RETURNS was (Part 25/30: seller-scoped and Platform-Admin-
  // vs-Super-Admin visibility independent of general customer permissions).
  PRESCRIPTIONS: 'prescriptions',
  // Prompt 32 — Distributor/Bulk Purchase enquiry management, its own
  // resource from the start (same rationale as RETURNS/PRESCRIPTIONS before
  // it): a Super Admin controls Platform Admin visibility into this
  // business-lead domain independently of ORDERS/CUSTOMERS permissions.
  DISTRIBUTOR_ENQUIRIES: 'distributor_enquiries',
} as const;

export const ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
  IMPORT: 'import',
  REFUND: 'refund',
  APPROVE: 'approve',
} as const;

export type Resource = (typeof RESOURCES)[keyof typeof RESOURCES];
export type Action = (typeof ACTIONS)[keyof typeof ACTIONS];

export type Permission = `${Resource}:${Action}`;

export function permission(resource: Resource, action: Action): Permission {
  return `${resource}:${action}`;
}

export const PERMISSION_EFFECTS = {
  GRANT: 'grant',
  DENY: 'deny',
} as const;

export type PermissionEffect = (typeof PERMISSION_EFFECTS)[keyof typeof PERMISSION_EFFECTS];

export const PERMISSIONS = {
  ORDERS_READ: permission(RESOURCES.ORDERS, ACTIONS.READ),
  ORDERS_REFUND: permission(RESOURCES.ORDERS, ACTIONS.REFUND),
  INVENTORY_WRITE: permission(RESOURCES.INVENTORY, ACTIONS.UPDATE),
  CONFIGURATION_UPDATE: permission(RESOURCES.CONFIGURATION, ACTIONS.UPDATE),
  FEATURE_FLAGS_UPDATE: permission(RESOURCES.FEATURE_FLAGS, ACTIONS.UPDATE),
} as const;
