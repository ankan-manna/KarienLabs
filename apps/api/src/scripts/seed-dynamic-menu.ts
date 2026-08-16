import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { DynamicMenuModel } from '../modules/platform/models/dynamic-menu.model';

interface SeedItem {
  key: string;
  label: string;
  path: string;
  requiredPermission?: string;
  requiredRole?: string;
}

interface SeedGroup {
  slug: string;
  label: string;
  items: SeedItem[];
}

/**
 * Faithfully mirrors the 13 static arrays in apps/web/src/constants/menu.ts (the
 * live admin sidebar source) as real DynamicMenu documents — one parent per group,
 * one child per menu item, `order` = the item's index within its original array.
 * Child keys are namespaced `<groupSlug>.<itemKey>` because a handful of item keys
 * repeat across groups (e.g. "dashboard", "orders", "coupons" both appear in an
 * admin group and in CUSTOMER_ACCOUNT_MENU) and `key` is globally unique on the model.
 */
const GROUPS: SeedGroup[] = [
  {
    slug: 'dashboard',
    label: 'Dashboard',
    items: [{ key: 'dashboard', label: 'Dashboard', path: '/admin/dashboard' }],
  },
  {
    slug: 'products',
    label: 'Products',
    items: [
      {
        key: 'products',
        label: 'Products',
        path: '/admin/catalog/products',
        requiredPermission: permission(RESOURCES.PRODUCTS, ACTIONS.READ),
      },
      {
        key: 'categories',
        label: 'Categories',
        path: '/admin/catalog/categories',
        requiredPermission: permission(RESOURCES.CATEGORIES, ACTIONS.READ),
      },
      {
        key: 'brands',
        label: 'Brands',
        path: '/admin/catalog/brands',
        requiredPermission: permission(RESOURCES.BRANDS, ACTIONS.READ),
      },
      {
        key: 'manufacturers',
        label: 'Manufacturers',
        path: '/admin/catalog/manufacturers',
        requiredPermission: permission(RESOURCES.MANUFACTURERS, ACTIONS.READ),
      },
    ],
  },
  {
    slug: 'inventory',
    label: 'Inventory',
    items: [
      {
        key: 'warehouses',
        label: 'Warehouses',
        path: '/admin/inventory/warehouses',
        requiredPermission: permission(RESOURCES.WAREHOUSES, ACTIONS.READ),
      },
      {
        key: 'suppliers',
        label: 'Suppliers',
        path: '/admin/inventory/suppliers',
        requiredPermission: permission(RESOURCES.SUPPLIERS, ACTIONS.READ),
      },
      {
        key: 'batches',
        label: 'Batches & Expiry',
        path: '/admin/inventory/batches',
        requiredPermission: permission(RESOURCES.BATCHES, ACTIONS.READ),
      },
      {
        key: 'stock-transfers',
        label: 'Stock Transfers',
        path: '/admin/inventory/stock-transfers',
        requiredPermission: permission(RESOURCES.INVENTORY, ACTIONS.READ),
      },
      {
        key: 'damaged-stock',
        label: 'Damaged Stock',
        path: '/admin/inventory/damaged-stock',
        requiredPermission: permission(RESOURCES.INVENTORY, ACTIONS.READ),
      },
      {
        key: 'purchase-requests',
        label: 'Purchase Requests',
        path: '/admin/inventory/purchase-requests',
        requiredPermission: permission(RESOURCES.PURCHASE_ORDERS, ACTIONS.READ),
      },
    ],
  },
  {
    slug: 'customers',
    label: 'Customers',
    items: [
      {
        key: 'customers',
        label: 'Customers',
        path: '/admin/customers',
        requiredPermission: permission(RESOURCES.CUSTOMERS, ACTIONS.READ),
      },
    ],
  },
  {
    slug: 'orders',
    label: 'Orders',
    items: [
      {
        key: 'orders',
        label: 'Orders',
        path: '/admin/orders',
        requiredPermission: permission(RESOURCES.ORDERS, ACTIONS.READ),
      },
      {
        key: 'returns',
        label: 'Returns',
        path: '/admin/orders/returns',
        requiredPermission: permission(RESOURCES.ORDERS, ACTIONS.READ),
      },
      {
        key: 'coupons',
        label: 'Coupons',
        path: '/admin/coupons',
        requiredPermission: permission(RESOURCES.COUPONS, ACTIONS.READ),
      },
    ],
  },
  {
    slug: 'payments',
    label: 'Payments',
    items: [
      {
        key: 'payments',
        label: 'Payments',
        path: '/admin/payments',
        requiredPermission: permission(RESOURCES.PAYMENTS, ACTIONS.READ),
      },
    ],
  },
  {
    slug: 'delivery',
    label: 'Delivery',
    items: [
      {
        key: 'delivery-partners',
        label: 'Delivery Partners',
        path: '/admin/delivery/partners',
        requiredPermission: permission(RESOURCES.DELIVERIES, ACTIONS.READ),
      },
      {
        key: 'shipping-zones',
        label: 'Shipping Zones',
        path: '/admin/delivery/zones',
        requiredPermission: permission(RESOURCES.SHIPPING, ACTIONS.READ),
      },
      {
        key: 'shipping-rules',
        label: 'Shipping Rules',
        path: '/admin/delivery/rules',
        requiredPermission: permission(RESOURCES.SHIPPING, ACTIONS.READ),
      },
      {
        key: 'shipments',
        label: 'Shipments',
        path: '/admin/delivery/shipments',
        requiredPermission: permission(RESOURCES.DELIVERIES, ACTIONS.READ),
      },
    ],
  },
  {
    slug: 'tax',
    label: 'Tax',
    items: [
      {
        key: 'gst-settings',
        label: 'GST Settings',
        path: '/admin/tax/gst-settings',
        requiredPermission: permission(RESOURCES.TAX, ACTIONS.READ),
      },
      {
        key: 'product-tax-mappings',
        label: 'Product Tax Mapping',
        path: '/admin/tax/product-mappings',
        requiredPermission: permission(RESOURCES.TAX, ACTIONS.READ),
      },
    ],
  },
  {
    slug: 'cms',
    label: 'CMS',
    items: [
      {
        key: 'cms-banners',
        label: 'Banners',
        path: '/admin/cms/banners',
        requiredPermission: permission(RESOURCES.CMS, ACTIONS.READ),
      },
      {
        key: 'cms-home-sections',
        label: 'Homepage Sections',
        path: '/admin/cms/home-sections',
        requiredPermission: permission(RESOURCES.CMS, ACTIONS.READ),
      },
      {
        key: 'cms-blogs',
        label: 'Blogs',
        path: '/admin/cms/blogs',
        requiredPermission: permission(RESOURCES.CMS, ACTIONS.READ),
      },
      {
        key: 'cms-faqs',
        label: 'FAQs',
        path: '/admin/cms/faqs',
        requiredPermission: permission(RESOURCES.CMS, ACTIONS.READ),
      },
      {
        key: 'cms-pages',
        label: 'Pages',
        path: '/admin/cms/pages',
        requiredPermission: permission(RESOURCES.CMS, ACTIONS.READ),
      },
    ],
  },
  {
    slug: 'notifications',
    label: 'Notifications',
    items: [
      {
        key: 'notification-templates',
        label: 'Templates',
        path: '/admin/notifications/templates',
        requiredPermission: permission(RESOURCES.NOTIFICATIONS, ACTIONS.READ),
      },
      {
        key: 'notification-history',
        label: 'History',
        path: '/admin/notifications/history',
        requiredPermission: permission(RESOURCES.NOTIFICATIONS, ACTIONS.READ),
      },
    ],
  },
  {
    slug: 'reports',
    label: 'Reports',
    items: [
      {
        key: 'reports',
        label: 'Reports',
        path: '/admin/reports',
        requiredPermission: permission(RESOURCES.REPORTS, ACTIONS.READ),
      },
      {
        key: 'analytics',
        label: 'Analytics',
        path: '/admin/analytics',
        requiredPermission: permission(RESOURCES.REPORTS, ACTIONS.READ),
      },
    ],
  },
  {
    slug: 'super-admin',
    label: 'Super Admin',
    items: [
      { key: 'roles', label: 'Roles & Permissions', path: '/admin/super/roles', requiredRole: 'super_admin' },
      { key: 'users', label: 'Admin Users', path: '/admin/super/users', requiredRole: 'super_admin' },
      {
        key: 'feature-flags',
        label: 'Feature Flags',
        path: '/admin/super/feature-flags',
        requiredRole: 'super_admin',
      },
      {
        key: 'configuration',
        label: 'Configuration',
        path: '/admin/super/configuration',
        requiredRole: 'super_admin',
      },
    ],
  },
  {
    slug: 'customer-account',
    label: 'Customer Account',
    items: [
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
    ],
  },
];

async function seed(): Promise<void> {
  await connectDatabase();

  let groupCount = 0;
  let itemCount = 0;

  for (const group of GROUPS) {
    const groupKey = `menu-group.${group.slug}`;
    // $setOnInsert so re-running the seed never clobbers an admin's existing edits
    // (label/order/isActive/etc changed via the Dynamic Menu admin UI).
    await DynamicMenuModel.updateOne(
      { key: groupKey },
      {
        $setOnInsert: {
          key: groupKey,
          label: group.label,
          icon: '',
          path: '',
          placement: 'sidebar',
          parentId: null,
          order: GROUPS.indexOf(group),
          requiredPermission: null,
          requiredRole: null,
          requiredFeatureFlag: null,
          isActive: true,
        },
      },
      { upsert: true },
    );
    const parent = await DynamicMenuModel.findOne({ key: groupKey }).lean();
    groupCount += 1;
    logger.info(`Seeded menu group: ${groupKey}`);

    for (let index = 0; index < group.items.length; index += 1) {
      const item = group.items[index];
      const childKey = `${group.slug}.${item.key}`;
      await DynamicMenuModel.updateOne(
        { key: childKey },
        {
          $setOnInsert: {
            key: childKey,
            label: item.label,
            icon: '',
            path: item.path,
            placement: 'sidebar',
            parentId: parent?._id ?? null,
            order: index,
            requiredPermission: item.requiredPermission ?? null,
            requiredRole: item.requiredRole ?? null,
            requiredFeatureFlag: null,
            isActive: true,
          },
        },
        { upsert: true },
      );
      itemCount += 1;
      logger.info(`Seeded menu item: ${childKey}`);
    }
  }

  logger.info(`Dynamic menu seed complete: ${groupCount} groups, ${itemCount} items.`);

  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Dynamic menu seeding failed:', err);
    process.exit(1);
  });
