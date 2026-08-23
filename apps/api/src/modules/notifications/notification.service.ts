import { NOTIFICATION_AUDIT_ACTIONS, NOTIFICATION_CATEGORIES, NOTIFICATION_STATUS, ROLES, type NotificationCategory, type NotificationChannel, type Role } from '@medcommerce/shared';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { enqueueNotificationDispatch } from '../../queues/queue';
import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { UserModel } from '../auth/models/user.model';
import { CustomerProfileModel } from '../customers/models/customer-profile.model';

import { NotificationHistoryModel } from './models/notification-history.model';
import { NotificationQueueModel } from './models/notification-queue.model';
import { NotificationTemplateModel } from './models/notification-template.model';
import { getNotificationConfig, type NotificationConfig } from './notification-config.service';
import { buildMockDataForTemplate, renderTemplateString } from './notification-render.util';

export interface EnqueueNotificationInput {
  channel: NotificationChannel;
  templateKey: string;
  recipient: string;
  userId?: string;
  orderId?: string;
  data?: Record<string, unknown>;
  /**
   * Part 14/15/47 — which Configuration category toggle gates this send.
   * Defaults to SYSTEM (admin-configurable, but not tied to a specific
   * customer-facing business category) when omitted.
   */
  category?: NotificationCategory;
  /**
   * Part 5/34 — set ONLY by OTP/security-critical auth flows. Bypasses the
   * master `notificationsEnabled` switch and the category toggle entirely
   * (a channel can still be disabled — see resolveConfigGate below) so a
   * generic "turn off notifications" admin action can never lock users out
   * of login/password-reset. NEVER set this for anything else.
   */
  critical?: boolean;
  /**
   * Part 25/57 — e.g. `PAYMENT_SUCCESS:<paymentId>`. When provided, a
   * second call with the SAME key is a safe no-op (checked against History
   * first for the common already-sent case, then enforced atomically via a
   * unique index on NotificationQueue for the concurrent-race case).
   */
  idempotencyKey?: string;
}

const CATEGORY_CONFIG_KEY: Partial<Record<NotificationCategory, keyof NotificationConfig>> = {
  [NOTIFICATION_CATEGORIES.ORDER]: 'orderNotificationsEnabled',
  [NOTIFICATION_CATEGORIES.PAYMENT]: 'paymentNotificationsEnabled',
  [NOTIFICATION_CATEGORIES.SHIPPING]: 'shippingNotificationsEnabled',
  [NOTIFICATION_CATEGORIES.RETURN]: 'returnNotificationsEnabled',
  [NOTIFICATION_CATEGORIES.PRESCRIPTION]: 'prescriptionNotificationsEnabled',
  [NOTIFICATION_CATEGORIES.ADMIN]: 'adminNotificationsEnabled',
};

const CHANNEL_CONFIG_KEY: Record<NotificationChannel, keyof NotificationConfig> = {
  email: 'emailEnabled',
  sms: 'smsEnabled',
  whatsapp: 'whatsappEnabled',
  push: 'pushEnabled',
};

/** Part 14/15/47 — returns a reason string if this send should be blocked, or null if it's allowed through. */
function resolveConfigGate(
  config: NotificationConfig,
  channel: NotificationChannel,
  category: NotificationCategory,
  critical: boolean,
): string | null {
  if (!config[CHANNEL_CONFIG_KEY[channel]]) {
    return `${channel} channel is disabled`;
  }
  if (critical) return null; // Part 5/34 — auth/OTP bypasses master + category gating.
  if (!config.notificationsEnabled) return 'notifications are disabled';
  const categoryKey = CATEGORY_CONFIG_KEY[category];
  if (categoryKey && !config[categoryKey]) return `${category} notifications are disabled`;
  return null;
}

/**
 * Part 30 — the customer's OWN email/SMS channel opt-out
 * (`CustomerProfile.notificationPreferences.emailEnabled`/`smsEnabled`,
 * defined since  21's profile model but never actually checked by
 * anything until now). Deliberately does NOT check the granular
 * `orderUpdates`/`paymentUpdates`/`deliveryUpdates` toggles — Part 30 is
 * explicit that customers must never be able to disable mandatory
 * transactional notifications, so those specific toggles stay
 * presentation-only; only the whole-CHANNEL preference (a legitimate "email
 * me, don't text me" choice) is enforced, and even that is skipped entirely
 * for `critical` (OTP/security) sends — same bypass as the admin-level
 * config gate above.
 */
async function isChannelDisabledByCustomerPreference(
  userId: string | undefined,
  channel: NotificationChannel,
): Promise<boolean> {
  if (!userId || (channel !== 'email' && channel !== 'sms')) return false;
  const profile = await CustomerProfileModel.findOne({ userId }).select('notificationPreferences').lean();
  const prefs = profile?.notificationPreferences;
  if (!prefs) return false;
  return channel === 'email' ? prefs.emailEnabled === false : prefs.smsEnabled === false;
}

/**
 * Part 27/35 — a send blocked by configuration is NOT silently dropped: a
 * CANCELLED history row is written directly (no queue doc, nothing for the
 * worker to do) so the skip is observable in the same admin/customer
 * history views as a real send.
 */
async function recordCancelled(input: EnqueueNotificationInput, reason: string): Promise<void> {
  logger.info(
    { channel: input.channel, templateKey: input.templateKey, category: input.category, reason },
    'Notification cancelled by configuration',
  );
  await NotificationHistoryModel.create({
    channel: input.channel,
    templateKey: input.templateKey,
    recipient: input.recipient,
    userId: input.userId ?? null,
    orderId: input.orderId ?? null,
    status: NOTIFICATION_STATUS.CANCELLED,
    errorCode: reason,
    idempotencyKey: input.idempotencyKey ?? null,
  });
}

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: number }).code === 11000;
}

/**
 * Part 1 — the CENTRAL notification entry point every business
 * module goes through; no module is allowed to call an email/SMS transport
 * directly. Writes the NotificationQueue document AND enqueues a BullMQ job
 * to dispatch it (apps/api/src/queues/workers/notification.worker.ts is the
 * consumer) — never a synchronous send inside a request handler (Part 23).
 */
export async function enqueueNotification(input: EnqueueNotificationInput): Promise<void> {
  const category = input.category ?? NOTIFICATION_CATEGORIES.SYSTEM;
  const config = await getNotificationConfig();
  const blockedReason = resolveConfigGate(config, input.channel, category, input.critical ?? false);
  if (blockedReason) {
    await recordCancelled(input, blockedReason);
    return;
  }

  if (!input.critical && (await isChannelDisabledByCustomerPreference(input.userId, input.channel))) {
    await recordCancelled(input, `customer disabled the ${input.channel} channel`);
    return;
  }

  if (input.idempotencyKey) {
    // Fast-path negative check — catches the common "already sent, queue
    // doc long since deleted" case cheaply. NOT the atomicity guarantee by
    // itself (see the unique-index catch below for the concurrent case).
    const alreadySent = await NotificationHistoryModel.exists({ idempotencyKey: input.idempotencyKey });
    if (alreadySent) {
      logger.info({ idempotencyKey: input.idempotencyKey }, 'Notification skipped — already sent (idempotency)');
      return;
    }
  }

  let doc;
  try {
    doc = await NotificationQueueModel.create({
      channel: input.channel,
      templateKey: input.templateKey,
      recipient: input.recipient,
      userId: input.userId ?? null,
      orderId: input.orderId ?? null,
      data: input.data ?? {},
      idempotencyKey: input.idempotencyKey ?? null,
    });
  } catch (error) {
    // Part 25/57 — two concurrent calls with the SAME idempotencyKey race
    // to create a queue doc; the unique sparse index on `idempotencyKey`
    // lets MongoDB itself pick exactly one winner. The loser lands here —
    // this is the expected, safe outcome, not a real error.
    if (input.idempotencyKey && isDuplicateKeyError(error)) {
      logger.info(
        { idempotencyKey: input.idempotencyKey },
        'Notification skipped — concurrent duplicate enqueue (idempotency)',
      );
      return;
    }
    throw error;
  }

  await enqueueNotificationDispatch(String(doc._id));
}

/**
 * Part 12/29 — the previously-missing admin-notification helper.
 * Queries REAL admin/super_admin users (never a hardcoded fake address —
 * see the low-stock/expiry job fix this replaces) and enqueues one
 * notification per recipient, category ADMIN.
 */
export async function notifyAdmins(input: {
  templateKey: string;
  data?: Record<string, unknown>;
  orderId?: string;
}): Promise<number> {
  const admins = await UserModel.find({
    role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN] },
    isActive: true,
    deletedAt: null,
  })
    .select('email name')
    .lean();

  for (const admin of admins) {
    await enqueueNotification({
      channel: 'email',
      templateKey: input.templateKey,
      recipient: admin.email,
      userId: String(admin._id),
      orderId: input.orderId,
      category: NOTIFICATION_CATEGORIES.ADMIN,
      data: { ...input.data, name: admin.name },
    });
  }

  return admins.length;
}

/**
 * Part 24/39/46 — admin-triggered retry for a FAILED notification.
 * Operates on the ORIGINATING NotificationQueue document (via
 * NotificationHistory.queueId), never re-derives `data` from scratch —
 * NotificationHistory intentionally never stores it (Part 21). The queue
 * doc is deliberately kept (not deleted) on final failure specifically so
 * this remains possible — see notification.worker.ts.
 */
export async function retryFailedNotification(
  historyId: string,
  actorId: string,
  actorRole?: Role,
): Promise<void> {
  const history = await NotificationHistoryModel.findById(historyId);
  if (!history) throw new NotFoundError('Notification');
  if (history.status !== NOTIFICATION_STATUS.FAILED) {
    throw new UnprocessableEntityError('Only a failed notification can be retried');
  }
  if (!history.queueId) {
    throw new UnprocessableEntityError('This notification has no retryable record on file');
  }

  const queued = await NotificationQueueModel.findById(history.queueId);
  if (!queued) {
    throw new UnprocessableEntityError('The original notification record is no longer available to retry');
  }

  queued.status = NOTIFICATION_STATUS.QUEUED;
  queued.attempts = 0;
  queued.lastError = '';
  await queued.save();
  await enqueueNotificationDispatch(String(queued._id));

  await recordAudit({
    actorId,
    actorType: actorRole ? actorTypeForRole(actorRole) : undefined,
    action: NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_RETRY_TRIGGERED,
    resource: 'notification',
    resourceId: historyId,
    metadata: { channel: history.channel, templateKey: history.templateKey },
  });
}

/**
 * Part 20 — admin template preview. Renders with SAFE, generic
 * mock data ONLY (never real customer/order/payment/prescription data —
 * see notification-render.util.ts's buildMockDataForTemplate) so previewing
 * a template can never leak anything real.
 */
export async function previewTemplate(templateId: string): Promise<{ subject: string; body: string }> {
  const template = await NotificationTemplateModel.findById(templateId).lean();
  if (!template) throw new NotFoundError('Notification template');

  const mockData = buildMockDataForTemplate(template.subject ?? '', template.body);
  return {
    subject: template.subject ? renderTemplateString(template.subject, mockData) : '',
    body: renderTemplateString(template.body, mockData),
  };
}

/**
 * Part 31 — provider health for admin/operations. Configuration
 * presence only (never verifies live connectivity, which would mean
 * sending a real test message) — matches the existing `isS3Configured()`-
 * style pattern used elsewhere in this codebase. No secrets/credentials in
 * the response, ever.
 */
export function getProviderHealth(): Record<
  'email' | 'sms' | 'whatsapp' | 'push',
  { configured: boolean; status: 'configured' | 'not_configured' }
> {
  const emailConfigured = Boolean(env.SMTP_HOST);
  return {
    email: { configured: emailConfigured, status: emailConfigured ? 'configured' : 'not_configured' },
    // Part 31 — SMS/WhatsApp/push are documented log-only stubs (no
    // provider credentials exist to check — see NOTIF-01/NOTIF-02 in
    // docs/DEVELOPMENT_TASKS.md); always reported honestly as not configured.
    sms: { configured: false, status: 'not_configured' },
    whatsapp: { configured: false, status: 'not_configured' },
    push: { configured: false, status: 'not_configured' },
  };
}

// --- Customer notification center (Part 53/54) ---

export async function listMyNotifications(userId: string, page: number, limit: number) {
  const filter = { userId };
  const skip = (page - 1) * limit;
  const [items, total, unreadCount] = await Promise.all([
    NotificationHistoryModel.find(filter).sort({ sentAt: -1 }).skip(skip).limit(limit).lean(),
    NotificationHistoryModel.countDocuments(filter),
    NotificationHistoryModel.countDocuments({ ...filter, isRead: false }),
  ]);
  return {
    items,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    unreadCount,
  };
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  return NotificationHistoryModel.countDocuments({ userId, isRead: false });
}

/** Ownership-checked — a customer can only mark THEIR OWN notification read, never an arbitrary id. */
export async function markNotificationRead(id: string, userId: string): Promise<void> {
  const result = await NotificationHistoryModel.updateOne(
    { _id: id, userId, isRead: false },
    { isRead: true, readAt: new Date() },
  );
  if (result.matchedCount === 0) {
    // Either it doesn't exist, isn't this user's, or was already read —
    // any of those is a safe, idempotent no-op, never an error (Part 54:
    // "use efficient database operations," not a strict single-item API).
    return;
  }
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await NotificationHistoryModel.updateMany(
    { userId, isRead: false },
    { isRead: true, readAt: new Date() },
  );
  return result.modifiedCount;
}
