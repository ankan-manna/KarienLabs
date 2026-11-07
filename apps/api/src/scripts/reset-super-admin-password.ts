import { ACTOR_TYPES, AUTH_ACTIONS, AUTH_RESULT, ROLES } from '@medcommerce/shared';
import bcrypt from 'bcrypt';

import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { recordAudit } from '../modules/audit/audit.service';
import { logoutAllSessions } from '../modules/auth/auth.service';
import { UserModel } from '../modules/auth/models/user.model';
import { passwordSchema } from '../utils/common-schemas';

/**
 * EXPLICIT Super Admin password recovery — deliberately a separate script
 * from seed-super-admin.ts, which refuses to touch an existing super_admin
 * by design (see its own comment). This is the dedicated "I know the
 * account exists but nobody has its current password" recovery path the
 * RUNBOOK/docs point to: it does NOT run silently as a side effect of any
 * other script, requires its own explicit env var (SUPER_ADMIN_RESET_PASSWORD
 * — a different name from the bootstrap script's SUPER_ADMIN_PASSWORD, so
 * the two can never be confused or accidentally chained in an automated
 * pipeline), and only ever targets an account that is ALREADY role:
 * super_admin — it will never create one or promote a different role.
 *
 * What it does, every time it runs:
 *   1. Sets a new bcrypt hash for the matched account.
 *   2. Resets failedLoginAttempts/lockedUntil (a recovery shouldn't leave
 *      the account one bad guess away from a fresh lockout).
 *   3. Sets mustChangePassword: true (this password now exists in whatever
 *      shared it with the operator — e.g. pasted into a chat, a ticket — so
 *      it must be rotated on first use, never treated as a long-term
 *      credential).
 *   4. Revokes every existing session (logoutAllSessions) — the same
 *      theft-recovery posture the self-service password-reset flow uses.
 *   5. Writes an audit record (actorType: SYSTEM) so this recovery is
 *      traceable later, same as any other sensitive account action.
 * It never prints the password itself, only confirmation of what changed.
 */
async function run(): Promise<void> {
  const email = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const newPassword = process.env.SUPER_ADMIN_RESET_PASSWORD || '';

  if (!email || !newPassword) {
    throw new Error(
      'SUPER_ADMIN_EMAIL and SUPER_ADMIN_RESET_PASSWORD must both be set in the environment before running this script.',
    );
  }

  const passwordCheck = passwordSchema.safeParse(newPassword);
  if (!passwordCheck.success) {
    throw new Error(`SUPER_ADMIN_RESET_PASSWORD is invalid: ${passwordCheck.error.issues[0]?.message}`);
  }

  await connectDatabase();

  const user = await UserModel.findOne({ email, role: ROLES.SUPER_ADMIN, deletedAt: null });
  if (!user) {
    await disconnectDatabase();
    throw new Error(
      `No super_admin account found with email "${email}". If no Super Admin exists yet at all, use ` +
        '"npm run seed:super-admin" instead (see docs/BRENTIS_ADMIN_BOOTSTRAP_GUIDE.md).',
    );
  }

  const before = {
    failedLoginAttempts: user.failedLoginAttempts,
    lockedUntil: user.lockedUntil,
    isActive: user.isActive,
    isSuspended: user.isSuspended,
  };

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.failedLoginAttempts = 0;
  user.lockedUntil = null;
  user.mustChangePassword = true;
  await user.save();

  await logoutAllSessions(String(user._id));

  await recordAudit({
    actorId: null,
    actorType: ACTOR_TYPES.SYSTEM,
    actorName: 'reset-super-admin-password script',
    action: AUTH_ACTIONS.PASSWORD_RESET_SUCCESS,
    resource: 'admin_user',
    resourceId: String(user._id),
    before,
    after: {
      failedLoginAttempts: 0,
      lockedUntil: null,
      mustChangePassword: true,
      sessionsRevoked: true,
    },
    result: AUTH_RESULT.SUCCESS,
  });

  logger.info(
    {
      email: user.email,
      id: String(user._id),
      failedLoginAttemptsReset: true,
      mustChangePassword: true,
      sessionsRevoked: true,
    },
    'Super Admin password recovered — account unlocked, all prior sessions revoked, password change required on next login.',
  );

  await disconnectDatabase();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Super Admin password recovery failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
