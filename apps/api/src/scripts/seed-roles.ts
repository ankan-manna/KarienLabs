import { ACTIONS, RESOURCES, ROLES, permission } from '@medcommerce/shared';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { RoleModel } from '../modules/auth/models/role.model';

const allResources = Object.values(RESOURCES);
const allActions = Object.values(ACTIONS);

const SEED_ROLES = [
  {
    key: ROLES.SUPER_ADMIN,
    name: 'Super Admin',
    isSystem: true,
    permissions: allResources.flatMap((r) => allActions.map((a) => permission(r, a))),
  },
  {
    key: ROLES.ADMIN,
    name: 'Admin',
    isSystem: true,
    // Everything the Platform Admin Panel (Prompt 5) covers except the Super-Admin-only
    // platform config surface (roles, users/admins, feature flags, raw configuration).
    permissions: [
      RESOURCES.PRODUCTS,
      // Prompt 12 — bundle/combo-pack admin CRUD; the admin role that already
      // manages Products also manages Bundles (a bundle IS a product SKU).
      RESOURCES.BUNDLES,
      RESOURCES.CATEGORIES,
      RESOURCES.BRANDS,
      RESOURCES.MANUFACTURERS,
      RESOURCES.ORDERS,
      RESOURCES.INVENTORY,
      RESOURCES.WAREHOUSES,
      // Prompt 11 — sellers own warehouses, so the admin role that already
      // manages warehouses also manages sellers; Super Admin gets it
      // automatically via the "every resource" list above.
      RESOURCES.SELLERS,
      RESOURCES.BATCHES,
      RESOURCES.SUPPLIERS,
      RESOURCES.PURCHASE_ORDERS,
      RESOURCES.CUSTOMERS,
      RESOURCES.COUPONS,
      RESOURCES.INVOICES,
      RESOURCES.PAYMENTS,
      RESOURCES.DELIVERIES,
      RESOURCES.SHIPPING,
      RESOURCES.TAX,
      RESOURCES.CMS,
      RESOURCES.REPORTS,
      RESOURCES.NOTIFICATIONS,
      RESOURCES.AUDIT_LOGS,
      RESOURCES.FILES,
      // Prompt 16 — Return/Replacement/Refund workflow (its own resource as
      // of this prompt; previously piggybacked on RESOURCES.ORDERS).
      RESOURCES.RETURNS,
      // Prompt 17 — Prescription review + configuration workflow (its own
      // resource as of this prompt; previously piggybacked on
      // RESOURCES.CUSTOMERS). Super Admin can still restrict a specific
      // Platform Admin's `prescriptions:update` (configuration) grant
      // independently via the existing Roles page (Part 42) — this seed is
      // only the default starting grant, same precedent as RETURNS above.
      RESOURCES.PRESCRIPTIONS,
      // Prompt 32 — Distributor/Bulk Purchase enquiry management (its own
      // resource from the start, same precedent as RETURNS/PRESCRIPTIONS
      // above). Super Admin can still restrict a specific Platform Admin's
      // grant independently via the existing Roles page — this seed is only
      // the default starting grant.
      RESOURCES.DISTRIBUTOR_ENQUIRIES,
    ].flatMap((r) => allActions.map((a) => permission(r, a))),
  },
  {
    key: ROLES.INVENTORY_MANAGER,
    name: 'Inventory Manager',
    isSystem: true,
    permissions: [RESOURCES.INVENTORY, RESOURCES.SUPPLIERS, RESOURCES.PURCHASE_ORDERS].flatMap(
      (r) =>
        [ACTIONS.CREATE, ACTIONS.READ, ACTIONS.UPDATE, ACTIONS.IMPORT, ACTIONS.EXPORT].map((a) =>
          permission(r, a),
        ),
    ),
  },
  {
    key: ROLES.CUSTOMER,
    name: 'Customer',
    isSystem: true,
    permissions: [permission(RESOURCES.ORDERS, ACTIONS.READ)],
  },
  {
    key: ROLES.DISTRIBUTOR,
    name: 'Distributor',
    isSystem: true,
    // A promoted customer, not an admin-panel role — same baseline access
    // as `customer` (storefront/account area, own orders). The actual
    // Distributor/Bulk Purchase workflow (enquiry submission, `GET
    // /distributor-enquiries/me`) is `requireAuth`-only, not
    // permission-gated, so no extra grant is needed here for that.
    permissions: [permission(RESOURCES.ORDERS, ACTIONS.READ)],
  },
];

async function seed(): Promise<void> {
  await connectDatabase();

  for (const role of SEED_ROLES) {
    await RoleModel.updateOne({ key: role.key }, { $set: role }, { upsert: true });
    logger.info(`Seeded role: ${role.key}`);
  }

  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Role seeding failed:', err);
    process.exit(1);
  });
