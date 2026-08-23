/**
 * Part 18 migration — backfills `sellerId` onto pre-existing
 * Warehouse/Order/Invoice records created before the Seller entity existed.
 *
 * Deliberately does NOT auto-fabricate a seller or guess which one an
 * existing record belongs to ("never silently corrupt historical data").
 * Instead it implements exactly the documented flow:
 *
 *   Existing Business Entity -> Create Initial Seller -> Map Existing
 *   Warehouses -> Map Existing Inventory (inventory is resolved via
 *   warehouseId, not stored directly — see Batch model, nothing to backfill
 *   there) -> Map Existing Orders -> Map Existing Invoices
 *
 * Usage:
 *   # Reuse an already-created seller (e.g. one made via the admin UI):
 *   SELLER_ID=<objectId> npm run migrate:seller-backfill
 *
 *   # Or let this script create the initial seller from real business details
 *   # (idempotent — reruns reuse the seller by GSTIN instead of duplicating it):
 *   SELLER_LEGAL_NAME="Acme Pharma Pvt Ltd" SELLER_GSTIN=27ABCDE1234F1Z5 \
 *     SELLER_DRUG_LICENSE=DL-20B-12345 npm run migrate:seller-backfill
 *
 *   # Report-only, no writes:
 *   npm run migrate:seller-backfill -- --dry-run
 *
 * Neither env vars nor --dry-run supplied and no existing seller specified ->
 * the script does nothing and exits non-zero with instructions, rather than
 * inventing placeholder seller data.
 */
import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { recordAudit } from '../modules/audit/audit.service';
import { WarehouseModel } from '../modules/inventory/models/warehouse.model';
import { InvoiceModel } from '../modules/invoices/models/invoice.model';
import { OrderModel } from '../modules/orders/models/order.model';
import { SellerModel } from '../modules/sellers/models/seller.model';

const isDryRun = process.argv.includes('--dry-run');

async function countUnmapped() {
  const [warehouses, orders, invoices] = await Promise.all([
    WarehouseModel.countDocuments({ sellerId: null, deletedAt: null }),
    OrderModel.countDocuments({ sellerId: null, deletedAt: null }),
    InvoiceModel.countDocuments({ sellerId: null, deletedAt: null }),
  ]);
  return { warehouses, orders, invoices };
}

async function resolveTargetSellerId(): Promise<string | null> {
  const explicitId = process.env.SELLER_ID;
  if (explicitId) {
    const seller = await SellerModel.findById(explicitId).lean();
    if (!seller) {
      logger.error({ explicitId }, 'SELLER_ID does not reference an existing seller — aborting.');
      return null;
    }
    return String(seller._id);
  }

  const legalName = process.env.SELLER_LEGAL_NAME;
  const gstin = process.env.SELLER_GSTIN?.toUpperCase();
  const drugLicenseNumber = process.env.SELLER_DRUG_LICENSE;

  if (!legalName || !gstin || !drugLicenseNumber) {
    logger.error(
      'No SELLER_ID given and SELLER_LEGAL_NAME/SELLER_GSTIN/SELLER_DRUG_LICENSE are not all set. ' +
        'Refusing to fabricate seller data — create the seller via the admin UI (or set these env ' +
        'vars with the real business/GSTIN/drug-license details) and rerun.',
    );
    return null;
  }

  const existing = await SellerModel.findOne({ gstin }).lean();
  if (existing) {
    logger.info({ sellerId: String(existing._id), gstin }, 'Reusing existing seller with this GSTIN.');
    return String(existing._id);
  }

  if (isDryRun) {
    logger.info({ legalName, gstin }, '[dry-run] Would create a new seller with these details.');
    return 'DRY-RUN-PLACEHOLDER';
  }

  const created = await SellerModel.create({ legalName, gstin, drugLicenseNumber, enabled: true });
  logger.info({ sellerId: String(created._id), legalName, gstin }, 'Created initial seller.');
  return String(created._id);
}

async function run(): Promise<void> {
  await connectDatabase();

  const before = await countUnmapped();
  logger.info({ before, dryRun: isDryRun }, 'Unmapped records before migration');

  if (before.warehouses === 0 && before.orders === 0 && before.invoices === 0) {
    logger.info('Nothing to migrate — every Warehouse/Order/Invoice already has a sellerId.');
    await disconnectDatabase();
    process.exit(0);
  }

  const sellerId = await resolveTargetSellerId();
  if (!sellerId) {
    await disconnectDatabase();
    process.exit(1);
  }

  if (isDryRun) {
    logger.info(
      { sellerId, wouldMap: before },
      '[dry-run] No writes performed. Rerun without --dry-run to apply.',
    );
    await disconnectDatabase();
    process.exit(0);
  }

  const [warehouseResult, orderResult, invoiceResult] = await Promise.all([
    WarehouseModel.updateMany({ sellerId: null, deletedAt: null }, { sellerId }),
    OrderModel.updateMany({ sellerId: null, deletedAt: null }, { sellerId }),
    InvoiceModel.updateMany({ sellerId: null, deletedAt: null }, { sellerId }),
  ]);

  const mapped = {
    warehouses: warehouseResult.modifiedCount,
    orders: orderResult.modifiedCount,
    invoices: invoiceResult.modifiedCount,
  };

  // Attributed to BACKGROUND_JOB, never a human actorId — this is an
  // operator-triggered but unattended script, matching  10/11's actor-
  // context rule that automated operations must not be logged as a person.
  await recordAudit({
    actorId: null,
    actorType: 'BACKGROUND_JOB',
    action: 'update',
    resource: 'seller_migration',
    resourceId: sellerId,
    after: mapped,
    metadata: { script: 'migrate-seller-backfill' },
  });

  logger.info({ sellerId, mapped }, 'Seller backfill migration complete.');
  await disconnectDatabase();
}

run().catch(async (err) => {
  logger.error({ err }, 'Seller backfill migration failed');
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
