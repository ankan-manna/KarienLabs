import { connectDatabase, disconnectDatabase } from '../config/database';
import { logger } from '../config/logger';
import { NotificationTemplateModel } from '../modules/notifications/models/notification-template.model';

/**
 * This codebase's notification templates are entirely DB-driven and
 * admin-authored (apps/web/src/modules/superadmin/pages/NotificationSettingsPage.tsx)
 * — by design, nothing is pre-seeded anywhere in the codebase. That means
 * the password-reset flow, while fully implemented end-to-end in
 * auth.service.ts, had no actual email content to send: with no matching
 * NotificationTemplate row, the dispatch worker falls back to a bare
 * `Key: value` dump of the notification data (see
 * notification.worker.ts's renderContent()), which is not something a real
 * customer could act on.
 *
 * Idempotent and non-destructive: only creates a row if no template with
 * that exact {key, channel} already exists — an admin who has since
 * customized any of these three templates through the UI is never
 * overwritten by re-running this script.
 */
const TEMPLATES: Array<{ key: string; channel: 'email'; subject: string; body: string }> = [
  {
    key: 'password_reset',
    channel: 'email',
    subject: 'Reset your BRENTIS HEALTHCARE password',
    body: `<p>Hi {{name}},</p>
<p>We received a request to reset your BRENTIS HEALTHCARE account password. Click the button below to choose a new one. This link is valid for 30 minutes and can only be used once.</p>
<p><a href="{{resetUrl}}" style="display:inline-block;background:#FF8000;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;">Reset my password</a></p>
<p>If the button doesn't work, copy and paste this link into your browser:<br/>{{resetUrl}}</p>
<p>If you didn't request this, you can safely ignore this email — your password will not be changed.</p>`,
  },
  {
    key: 'password_reset_confirmation',
    channel: 'email',
    subject: 'Your BRENTIS HEALTHCARE password was changed',
    body: `<p>Hi {{name}},</p>
<p>This confirms your BRENTIS HEALTHCARE account password was just changed. For your security, you've been signed out of all devices and will need to sign in again with your new password.</p>
<p>If you did not make this change, please contact our support team immediately.</p>`,
  },
  {
    key: 'password_reset_otp',
    channel: 'email',
    subject: 'Your BRENTIS HEALTHCARE password reset code',
    body: `<p>Your password reset code is:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:4px;">{{code}}</p>
<p>This code expires in {{expiryMinutes}} minutes. If you didn't request this, you can safely ignore this email.</p>`,
  },
];

async function seed(): Promise<void> {
  await connectDatabase();

  let created = 0;
  let skipped = 0;

  for (const t of TEMPLATES) {
    const existing = await NotificationTemplateModel.findOne({ key: t.key, channel: t.channel });
    if (existing) {
      skipped += 1;
      continue;
    }
    await NotificationTemplateModel.create({
      key: t.key,
      channel: t.channel,
      subject: t.subject,
      body: t.body,
      isActive: true,
    });
    created += 1;
  }

  logger.info({ created, skipped }, 'Notification template seeding complete');
  await disconnectDatabase();
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Notification template seeding failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
