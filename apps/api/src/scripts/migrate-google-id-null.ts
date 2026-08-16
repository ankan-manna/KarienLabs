/**
 * Backfill for user.model.ts's `googleId` fix: the field used to be declared
 * with `default: null`, which combined with `sparse: true` to mean every
 * non-Google user got a literal `googleId: null` written on creation — and
 * MongoDB's sparse index only excludes documents where the field is
 * genuinely ABSENT, not where it's present-but-null. So the second such user
 * ever created hit `E11000 duplicate key error ... googleId_1 dup key: {
 * googleId: null }`.
 *
 * The model no longer sets that default, so newly created users are
 * unaffected. This script unsets the stored `null` on documents that were
 * created before the fix, so the sparse unique index applies to them too.
 *
 * Usage:
 *   npm run migrate:google-id-null
 *   npm run migrate:google-id-null -- --dry-run
 */
import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { UserModel } from '../modules/auth/models/user.model';

const isDryRun = process.argv.includes('--dry-run');

async function run() {
  await connectDatabase();

  const affected = await UserModel.countDocuments({ googleId: null });
  logger.info({ affected, dryRun: isDryRun }, 'Users with stored googleId: null');

  if (affected === 0) {
    logger.info('Nothing to migrate.');
    await disconnectDatabase();
    process.exit(0);
  }

  if (isDryRun) {
    logger.info({ wouldUnset: affected }, '[dry-run] No writes performed. Rerun without --dry-run to apply.');
    await disconnectDatabase();
    process.exit(0);
  }

  const result = await UserModel.updateMany({ googleId: null }, { $unset: { googleId: 1 } });
  logger.info({ modified: result.modifiedCount }, 'googleId: null backfill complete.');

  await disconnectDatabase();
}

run().catch(async (err) => {
  logger.error({ err }, 'googleId null migration failed');
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
