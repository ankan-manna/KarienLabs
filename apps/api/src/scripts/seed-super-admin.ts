import { ROLES } from '@medcommerce/shared';
import bcrypt from 'bcrypt';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { UserModel } from '../modules/auth/models/user.model';
import { passwordSchema } from '../utils/common-schemas';

/**
 * RUNBOOK bootstrap script — this codebase has no other path to a first
 * Super Admin account: `/api/v1/auth/register` always creates a `customer`
 * (auth.service.ts), and every admin-creation endpoint
 * (rbac-admin.routes.ts POST /users -> admin-user.service.ts::createAdminUser)
 * requires an ALREADY-AUTHENTICATED super_admin actor
 * (assertCanAssignRole). Something has to create the very first one
 * directly against the database — this script is that "something",
 * mirroring seed-roles.ts's pattern (a plain idempotent script run once via
 * `npm run seed:super-admin`, never exposed as an HTTP endpoint so it can't
 * be hit by anyone post-deployment).
 *
 * Idempotent: if a super_admin already exists, this is a safe no-op — it
 * will NOT create a second one or touch the existing account, so it's safe
 * to leave in a startup runbook/CI script that might run more than once.
 */
async function seed(): Promise<void> {
  const email = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || '';
  const name = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be set in the environment before running this script.',
    );
  }
  // Same rule the admin-creation API route enforces (common-schemas.ts) —
  // a directly-DB-seeded account should never be weaker than one created
  // through the normal UI/API path.
  const passwordCheck = passwordSchema.safeParse(password);
  if (!passwordCheck.success) {
    throw new Error(`SUPER_ADMIN_PASSWORD is invalid: ${passwordCheck.error.issues[0]?.message}`);
  }

  await connectDatabase();

  const existingSuperAdmin = await UserModel.findOne({ role: ROLES.SUPER_ADMIN }).lean();
  if (existingSuperAdmin) {
    logger.info(
      { email: existingSuperAdmin.email },
      'A super_admin account already exists — skipping (this script never creates a second one)',
    );
    await disconnectDatabase();
    return;
  }

  const existingByEmail = await UserModel.findOne({ email }).lean();
  if (existingByEmail) {
    throw new Error(
      `An account with email "${email}" already exists with role "${existingByEmail.role}" — refusing to overwrite it. Use a different SUPER_ADMIN_EMAIL or promote this account via the database/admin API instead.`,
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await UserModel.create({
    name,
    email,
    passwordHash,
    role: ROLES.SUPER_ADMIN,
    isActive: true,
    emailVerified: true,
  });

  logger.info({ email: user.email, id: String(user._id) }, 'Super Admin account created');
  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Super Admin seeding failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
