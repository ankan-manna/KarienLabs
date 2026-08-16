import type { Action, Resource, Role } from '@medcommerce/shared';

export interface MenuItem {
  key: string;
  label: string;
  path: string;
  requiredPermission?: { resource: Resource; action: Action };
  requiredRole?: Role[];
  requiredFlag?: string;
}

export const DASHBOARD_MENU: MenuItem[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/admin/dashboard' },
];

export const PRODUCT_MENU: MenuItem[] = [
  {
    key: 'products',
    label: 'Products',
    path: '/admin/catalog/products',
    requiredPermission: { resource: 'products', action: 'read' },
  },
  {
    key: 'bundles',
    label: 'Bundles',
    path: '/admin/catalog/bundles',
    requiredPermission: { resource: 'bundles', action: 'read' },
  },
  {
    key: 'categories',
    label: 'Categories',
    path: '/admin/catalog/categories',
    requiredPermission: { resource: 'categories', action: 'read' },
  },
  {
    key: 'brands',
    label: 'Brands',
    path: '/admin/catalog/brands',
    requiredPermission: { resource: 'brands', action: 'read' },
  },
  {
    key: 'manufacturers',
    label: 'Manufacturers',
    path: '/admin/catalog/manufacturers',
    requiredPermission: { resource: 'manufacturers', action: 'read' },
  },
];

export const INVENTORY_MENU: MenuItem[] = [
  {
    key: 'sellers',
    label: 'Sellers',
    path: '/admin/sellers',
    requiredPermission: { resource: 'sellers', action: 'read' },
  },
  {
    key: 'warehouses',
    label: 'Warehouses',
    path: '/admin/inventory/warehouses',
    requiredPermission: { resource: 'warehouses', action: 'read' },
  },
  {
    key: 'suppliers',
    label: 'Suppliers',
    path: '/admin/inventory/suppliers',
    requiredPermission: { resource: 'suppliers', action: 'read' },
  },
  {
    key: 'batches',
    label: 'Batches & Expiry',
    path: '/admin/inventory/batches',
    requiredPermission: { resource: 'batches', action: 'read' },
  },
  {
    key: 'add-inventory',
    label: 'Add Inventory',
    path: '/admin/inventory/add-stock',
    // Part 24 — a write action, so gated on `update` (not `read` like its
    // siblings above): an actor without permission to actually use this
    // page has no reason to see it in the sidebar either.
    requiredPermission: { resource: 'inventory', action: 'update' },
  },
  {
    key: 'stock-transfers',
    label: 'Stock Transfers',
    path: '/admin/inventory/stock-transfers',
    requiredPermission: { resource: 'inventory', action: 'read' },
  },
  {
    key: 'damaged-stock',
    label: 'Damaged Stock',
    path: '/admin/inventory/damaged-stock',
    requiredPermission: { resource: 'inventory', action: 'read' },
  },
  {
    key: 'purchase-requests',
    label: 'Purchase Requests',
    path: '/admin/inventory/purchase-requests',
    requiredPermission: { resource: 'purchase_orders', action: 'read' },
  },
];

export const CUSTOMER_MENU: MenuItem[] = [
  {
    key: 'customers',
    label: 'Customers',
    path: '/admin/customers',
    requiredPermission: { resource: 'customers', action: 'read' },
  },
  {
    key: 'prescriptions',
    label: 'Prescriptions',
    path: '/admin/customers/prescriptions',
    // Prompt 17 — its own RBAC resource (was piggybacked on "customers"
    // before). Super Admin controls Platform Admin visibility the same way
    // every other nav entry already works.
    requiredPermission: { resource: 'prescriptions', action: 'read' },
  },
  {
    key: 'distributor-enquiries',
    label: 'Distributor Enquiries',
    path: '/admin/distributor-enquiries',
    // Prompt 32 — its own RBAC resource from the start, same precedent as
    // RETURNS/PRESCRIPTIONS above.
    requiredPermission: { resource: 'distributor_enquiries', action: 'read' },
  },
];

export const ORDER_MENU: MenuItem[] = [
  {
    key: 'orders',
    label: 'Orders',
    path: '/admin/orders',
    requiredPermission: { resource: 'orders', action: 'read' },
  },
  {
    key: 'returns',
    label: 'Returns',
    path: '/admin/orders/returns',
    // Prompt 16 — Returns now has its own RBAC resource (was piggybacked on
    // "orders" before). Super Admin controls Platform Admin visibility via
    // the same role-permission mechanism as every other nav entry.
    requiredPermission: { resource: 'returns', action: 'read' },
  },
  {
    key: 'coupons',
    label: 'Coupons',
    path: '/admin/coupons',
    requiredPermission: { resource: 'coupons', action: 'read' },
  },
];

export const PAYMENT_MENU: MenuItem[] = [
  {
    key: 'payments',
    label: 'Payments',
    path: '/admin/payments',
    requiredPermission: { resource: 'payments', action: 'read' },
  },
  {
    key: 'invoices',
    label: 'Invoices',
    path: '/admin/invoices',
    requiredPermission: { resource: 'invoices', action: 'read' },
  },
];

export const DELIVERY_MENU: MenuItem[] = [
  {
    key: 'delivery-partners',
    label: 'Delivery Partners',
    path: '/admin/delivery/partners',
    requiredPermission: { resource: 'deliveries', action: 'read' },
  },
  {
    key: 'shipping-zones',
    label: 'Shipping Zones',
    path: '/admin/delivery/zones',
    requiredPermission: { resource: 'shipping', action: 'read' },
  },
  {
    key: 'shipping-rules',
    label: 'Shipping Rules',
    path: '/admin/delivery/rules',
    requiredPermission: { resource: 'shipping', action: 'read' },
  },
  {
    key: 'shipments',
    label: 'Shipments',
    path: '/admin/delivery/shipments',
    requiredPermission: { resource: 'deliveries', action: 'read' },
  },
];

export const TAX_MENU: MenuItem[] = [
  {
    key: 'gst-settings',
    label: 'GST Settings',
    path: '/admin/tax/gst-settings',
    requiredPermission: { resource: 'tax', action: 'read' },
  },
  {
    key: 'product-tax-mappings',
    label: 'Product Tax Mapping',
    path: '/admin/tax/product-mappings',
    requiredPermission: { resource: 'tax', action: 'read' },
  },
];

export const CMS_MENU: MenuItem[] = [
  {
    key: 'cms-banners',
    label: 'Banners',
    path: '/admin/cms/banners',
    requiredPermission: { resource: 'cms', action: 'read' },
  },
  {
    key: 'cms-home-sections',
    label: 'Homepage Sections',
    path: '/admin/cms/home-sections',
    requiredPermission: { resource: 'cms', action: 'read' },
  },
  {
    key: 'cms-blogs',
    label: 'Blogs',
    path: '/admin/cms/blogs',
    requiredPermission: { resource: 'cms', action: 'read' },
  },
  {
    key: 'cms-faqs',
    label: 'FAQs',
    path: '/admin/cms/faqs',
    requiredPermission: { resource: 'cms', action: 'read' },
  },
  {
    key: 'cms-pages',
    label: 'Pages',
    path: '/admin/cms/pages',
    requiredPermission: { resource: 'cms', action: 'read' },
  },
  {
    key: 'cms-site-settings',
    label: 'Site Settings',
    path: '/admin/cms/site-settings',
    requiredPermission: { resource: 'cms', action: 'update' },
  },
];

export const NOTIFICATIONS_MENU: MenuItem[] = [
  {
    key: 'notification-templates',
    label: 'Templates',
    path: '/admin/notifications/templates',
    requiredPermission: { resource: 'notifications', action: 'read' },
  },
  {
    key: 'notification-history',
    label: 'History',
    path: '/admin/notifications/history',
    requiredPermission: { resource: 'notifications', action: 'read' },
  },
];

export const REPORTS_MENU: MenuItem[] = [
  {
    key: 'reports',
    label: 'Reports',
    path: '/admin/reports',
    requiredPermission: { resource: 'reports', action: 'read' },
  },
  {
    key: 'analytics',
    label: 'Analytics',
    path: '/admin/analytics',
    requiredPermission: { resource: 'reports', action: 'read' },
  },
  {
    key: 'search-analytics',
    label: 'Search Analytics',
    path: '/admin/search-analytics',
    requiredPermission: { resource: 'reports', action: 'read' },
  },
];

export const SUPER_ADMIN_MENU: MenuItem[] = [
  {
    key: 'roles',
    label: 'Roles & Permissions',
    path: '/admin/super/roles',
    requiredRole: ['super_admin'],
  },
  { key: 'users', label: 'Admin Users', path: '/admin/super/users', requiredRole: ['super_admin'] },
  {
    key: 'feature-flags',
    label: 'Feature Flags',
    path: '/admin/super/feature-flags',
    requiredRole: ['super_admin'],
  },
  {
    key: 'configuration',
    label: 'Configuration',
    path: '/admin/super/configuration',
    requiredRole: ['super_admin'],
  },
  {
    key: 'dynamic-menu',
    label: 'Dynamic Menu',
    path: '/admin/super/dynamic-menu',
    requiredPermission: { resource: 'menus', action: 'read' },
  },
  {
    key: 'medical-compliance',
    label: 'Medical Compliance',
    path: '/admin/super/medical-compliance',
    // Prompt 17 Part 39/42 — permission-gated (not requiredRole), so Super
    // Admin can grant a specific Platform Admin visibility into this
    // configuration section without granting the full raw Configuration
    // resource or Super Admin role itself.
    requiredPermission: { resource: 'prescriptions', action: 'update' },
  },
  {
    key: 'coupon-settings',
    label: 'Coupon Settings',
    path: '/admin/super/coupon-settings',
    // Prompt 19 Part 9/54 — same permission-gated (not requiredRole)
    // pattern as Medical Compliance above.
    requiredPermission: { resource: 'coupons', action: 'update' },
  },
  {
    key: 'fulfillment-automation',
    label: 'Fulfillment Automation',
    path: '/admin/super/fulfillment-automation',
    // Prompt 27 Part 30/31 — same permission-gated (not requiredRole)
    // pattern; reuses `orders:update`, the SAME permission that already
    // gates the manual order-status-transition action this page automates.
    requiredPermission: { resource: 'orders', action: 'update' },
  },
  {
    key: 'notification-settings',
    label: 'Notification Settings',
    path: '/admin/super/notification-settings',
    // Prompt 20 Part 9/15 — same permission-gated (not requiredRole) pattern.
    requiredPermission: { resource: 'notifications', action: 'update' },
  },
  {
    key: 'analytics-settings',
    label: 'Analytics Settings',
    path: '/admin/super/analytics-settings',
    // Prompt 22 Part 9/46 — same permission-gated (not requiredRole) pattern
    // as Coupon/Notification Settings; reuses `reports:update`, the same
    // permission the Reports/Analytics screens already require for admin
    // configuration, rather than inventing a new permission vocabulary.
    requiredPermission: { resource: 'reports', action: 'update' },
  },
  {
    key: 'seo-settings',
    label: 'SEO Settings',
    path: '/admin/super/seo-settings',
    // Prompt 23 Part 9/46/49 — same permission-gated (not requiredRole)
    // pattern; reuses `configuration:update` (seo-admin.routes.ts's exact
    // backend gate), not a new permission.
    requiredPermission: { resource: 'configuration', action: 'update' },
  },
  {
    key: 'security-center',
    label: 'Security Center',
    path: '/admin/super/security',
    requiredPermission: { resource: 'audit_logs', action: 'read' },
  },
  {
    key: 'audit-center',
    label: 'Audit Center',
    path: '/admin/super/audit',
    requiredPermission: { resource: 'audit_logs', action: 'read' },
  },
];

export const CUSTOMER_ACCOUNT_MENU: MenuItem[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/account' },
  { key: 'profile', label: 'Profile', path: '/account/profile' },
  { key: 'orders', label: 'My Orders', path: '/account/orders' },
  { key: 'addresses', label: 'Addresses', path: '/account/addresses' },
  { key: 'wishlist', label: 'Wishlist', path: '/account/wishlist' },
  { key: 'invoices', label: 'Invoices', path: '/account/invoices' },
  { key: 'prescriptions', label: 'Prescriptions', path: '/account/prescriptions' },
  { key: 'reviews', label: 'My Reviews', path: '/account/reviews' },
  { key: 'coupons', label: 'Coupons', path: '/account/coupons' },
  { key: 'notifications', label: 'Notifications', path: '/account/notifications' },
];
