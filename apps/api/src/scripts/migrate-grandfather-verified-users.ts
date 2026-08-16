/**
 * Prompt 31 — `login()` now blocks CUSTOMER accounts with `emailVerified:
 * false` when `authentication.registrationOtpEnabled` is on (default ON —
 * see auth-config.service.ts). Every customer account created before this
 * feature shipped has `emailVerified: false` (the schema's own default; no
 * enforcement existed until now) and would otherwise be locked out of an
 * account they never had to verify anything to create.
 *
 * This is a ONE-TIME, backward-compatibility backfill: it marks every
 * EXISTING customer account verified as of the moment it runs. It must be
 * run once, before (or in the same deploy as) `registrationOtpEnabled` is
 * turned on in a given environment — it does not need to run again, and
 * running it again is a safe no-op for accounts it already covered (new
 * unverified accounts created going forward are exactly the ones the new
 * OTP gate is supposed to catch, so this script deliberately never re-runs
 * against them).
 *
 * Scoped to `role: 'customer'` only, matching login()'s own scoping —
 * admin/seller/platform-admin accounts are created by an already-
 * authenticated admin or the bootstrap seed script, neither of which this
 * feature governs, and were never blocked by this check to begin with.
 *
 * Usage:
 *   npm run migrate:grandfather-verified-users
 *   npm run migrate:grandfather-verified-users -- --dry-run
 */
import { ROLES } from '@medcommerce/shared';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { UserModel } from '../modules/auth/models/user.model';

const isDryRun = process.argv.includes('--dry-run');

async function run() {
  await connectDatabase();

  const filter = { role: ROLES.CUSTOMER, emailVerified: { $ne: true } };
  const affected = await UserModel.countDocuments(filter);
  logger.info({ affected, dryRun: isDryRun }, 'Pre-existing unverified customer accounts found');

  if (affected === 0) {
    logger.info('Nothing to migrate.');
    await disconnectDatabase();
    process.exit(0);
  }

  if (isDryRun) {
    logger.info(
      { wouldVerify: affected },
      '[dry-run] No writes performed. Rerun without --dry-run to apply.',
    );
    await disconnectDatabase();
    process.exit(0);
  }

  const result = await UserModel.updateMany(filter, { emailVerified: true });
  logger.info({ modified: result.modifiedCount }, 'Grandfather email-verification backfill complete.');

  await disconnectDatabase();
}

run().catch(async (err) => {
  logger.error({ err }, 'Grandfather email-verification migration failed');
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
