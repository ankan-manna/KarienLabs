import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { FeatureFlagModel } from '../modules/auth/models/feature-flag.model';

/** The full module list from the Feature Flag Engine spec — every one of these ships enabled by default so existing behavior is unchanged; toggling any off is the admin's opt-out, not an opt-in the platform starts broken with. */
const SEED_FLAGS = [
  'products',
  'inventory',
  'coupons',
  'wishlist',
  'prescription_upload',
  'razorpay',
  'cash_on_delivery',
  'returns',
  'refunds',
  'invoices',
  'reports',
  'analytics',
  'notifications',
  'cms',
  'reviews',
  'shipping',
  'gst',
  'suppliers',
  'warehouses',
  'manufacturers',
  'brands',
  'blogs',
  'offers',
].map((key) => ({ key, enabled: true, scope: 'global' as const, rolloutPercentage: 100 }));

async function seed(): Promise<void> {
  await connectDatabase();

  for (const flag of SEED_FLAGS) {
    // $setOnInsert so re-running the seed never clobbers an admin's existing toggle.
    await FeatureFlagModel.updateOne(
      { key: flag.key },
      { $setOnInsert: flag },
      { upsert: true },
    );
    logger.info(`Seeded feature flag: ${flag.key}`);
  }

  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Feature flag seeding failed:', err);
    process.exit(1);
  });
