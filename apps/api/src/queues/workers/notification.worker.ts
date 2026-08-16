import { NOTIFICATION_STATUS } from '@medcommerce/shared';
import { Worker } from 'bullmq';

import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { createQueueConnection } from '../../config/redis';
import { runWithJobContext } from '../../config/request-context';
import { sendEmail } from '../../integrations/notifications/email-transport';
import { sendPush } from '../../integrations/notifications/push-transport';
import { sendSms } from '../../integrations/notifications/sms-transport';
import { sendWhatsApp } from '../../integrations/notifications/whatsapp-transport';
import { NotificationHistoryModel } from '../../modules/notifications/models/notification-history.model';
import { NotificationQueueModel } from '../../modules/notifications/models/notification-queue.model';
import { NotificationTemplateModel } from '../../modules/notifications/models/notification-template.model';
import { renderTemplateString } from '../../modules/notifications/notification-render.util';
import { QUEUE_NAMES, type DispatchNotificationJobData } from '../queue';

function humanize(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Part 38 — every customer-facing email gets the project logo automatically; templates don't each need to know/pass it. Served from the web app's public static assets (Part 38: never a filesystem path baked into application code). */
function brandingContext(channel: string): Record<string, string> {
  if (channel !== 'email') return {};
  return { logoUrl: `${env.WEB_BASE_URL}/logo.jpg` };
}

/**
 * Renders the notification content via the shared Handlebars util (Part 1 —
 * one render implementation, shared with the admin template-preview
 * endpoint). Prefers an admin-authored NotificationTemplate; falls back to
 * a generic rendering of the raw `data` payload so a missing template
 * degrades to *something* useful being sent/logged rather than the whole
 * job failing outright.
 */
async function renderContent(
  channel: string,
  templateKey: string,
  data: Record<string, unknown>,
): Promise<{ subject: string; body: string }> {
  const template = await NotificationTemplateModel.findOne({
    key: templateKey,
    channel,
    isActive: true,
  }).lean();

  const context = { ...data, ...brandingContext(channel) };

  if (template) {
    const subject = template.subject ? renderTemplateString(template.subject, context) : '';
    const body = renderTemplateString(template.body, context);
    return { subject, body };
  }

  logger.warn(
    { templateKey, channel },
    'No active NotificationTemplate found — falling back to a generic rendering',
  );
  const subject = humanize(templateKey);
  const body = Object.entries(data)
    .map(([k, v]) => `${humanize(k)}: ${String(v)}`)
    .join('\n');
  return { subject, body: body || subject };
}

async function dispatch(channel: string, recipient: string, subject: string, body: string) {
  switch (channel) {
    case 'email':
      return sendEmail({ to: recipient, subject, html: body.replace(/\n/g, '<br/>') });
    case 'sms':
      return sendSms({ to: recipient, body });
    case 'whatsapp':
      return sendWhatsApp({ to: recipient, body });
    case 'push':
      return sendPush({ to: recipient, title: subject || 'KarienLabs', body });
    default:
      throw new Error(`Unknown notification channel "${channel}"`);
  }
}

/** Part 21/42/43 — a SAFE, bounded error summary for history/logs — never the raw provider error object (which can carry request/response internals, and for SMTP occasionally echoes back parts of the message). */
function safeErrorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, 300);
}

export function startNotificationWorker(): Worker<DispatchNotificationJobData> {
  const worker = new Worker<DispatchNotificationJobData>(
    QUEUE_NAMES.NOTIFICATION_DISPATCH,
    async (job) =>
      runWithJobContext('notification-dispatch', job.id, async () => {
        const queued = await NotificationQueueModel.findById(job.data.notificationQueueId);
        if (!queued) return; // Already dispatched/removed — nothing to do.
        if (queued.status === NOTIFICATION_STATUS.SENT) return; // Idempotent under retry.

        const { subject, body } = await renderContent(
          queued.channel,
          queued.templateKey,
          (queued.data as Record<string, unknown>) ?? {},
        );

        try {
          await dispatch(queued.channel, queued.recipient, subject, body);

          await NotificationHistoryModel.create({
            channel: queued.channel,
            templateKey: queued.templateKey,
            recipient: queued.recipient,
            userId: queued.userId,
            orderId: queued.orderId,
            idempotencyKey: queued.idempotencyKey,
            queueId: queued._id,
            status: NOTIFICATION_STATUS.SENT,
          });
          await NotificationQueueModel.deleteOne({ _id: queued._id });
        } catch (err) {
          const errorCode = safeErrorCode(err);
          queued.attempts += 1;
          queued.lastError = errorCode;

          // BullMQ's own `attempts`/`backoff` (see queue.ts) drives retry timing;
          // once BullMQ itself gives up (this was the final attempt), park the
          // terminal state in history/queue rather than losing it silently.
          const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
          if (isFinalAttempt) {
            queued.status = NOTIFICATION_STATUS.FAILED;
            await queued.save();
            await NotificationHistoryModel.create({
              channel: queued.channel,
              templateKey: queued.templateKey,
              recipient: queued.recipient,
              userId: queued.userId,
              orderId: queued.orderId,
              idempotencyKey: queued.idempotencyKey,
              queueId: queued._id, // deliberately KEPT (not deleted) so retry can find it — see notification.service.ts's retryFailedNotification.
              status: NOTIFICATION_STATUS.FAILED,
              errorCode,
            });
          } else {
            await queued.save();
          }

          throw err; // Let BullMQ record the failure and schedule the retry.
        }
      }),
    { connection: createQueueConnection(), concurrency: 8 },
  );

  worker.on('failed', (job, err) =>
    logger.error({ jobId: job?.id, err }, 'Notification dispatch job failed'),
  );

  return worker;
}
