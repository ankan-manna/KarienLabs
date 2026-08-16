import { ACTIONS, NOTIFICATION_AUDIT_ACTIONS, NOTIFICATION_CHANNELS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { notificationSendRateLimiter } from '../../middlewares/rate-limit.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { createCrudRouter } from '../../utils/crud-router.factory';
import { listQuerySchema, type ListQuery } from '../../utils/pagination';
import { validate } from '../../utils/validate';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';

import { NotificationHistoryModel } from './models/notification-history.model';
import { getNotificationConfig, setNotificationConfig } from './notification-config.service';
import { notificationTemplateRepository } from './notification-template.repository';
import * as notificationService from './notification.service';

const ALL_CHANNELS = [
  NOTIFICATION_CHANNELS.EMAIL,
  NOTIFICATION_CHANNELS.SMS,
  NOTIFICATION_CHANNELS.WHATSAPP,
  NOTIFICATION_CHANNELS.PUSH,
] as const;

const createTemplateSchema = z.object({
  key: z.string().min(1),
  channel: z.enum(ALL_CHANNELS),
  subject: z.string().optional(),
  body: z.string().min(1),
  isActive: z.boolean().optional(),
});

const sendNotificationSchema = z.object({
  channel: z.enum(ALL_CHANNELS),
  templateKey: z.string().min(1),
  recipient: z.string().min(1),
  userId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const notificationsRouter = Router();

notificationsRouter.use(
  '/templates',
  createCrudRouter({
    resource: RESOURCES.NOTIFICATIONS,
    repository: notificationTemplateRepository,
    createSchema: createTemplateSchema,
    label: 'Notification template',
    // Prompt 20 Part 44 — previously had ZERO audit trail (createCrudRouter
    // didn't audit create/update/delete at all). Activate/deactivate goes
    // through the dedicated /status route below for a precise
    // ACTIVATED/DEACTIVATED action name rather than the generic UPDATED.
    auditActions: {
      created: NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_TEMPLATE_CREATED,
      updated: NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_TEMPLATE_UPDATED,
      deleted: NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_TEMPLATE_DELETED,
    },
    excelColumns: [
      { header: 'Key', key: 'key', width: 24 },
      { header: 'Channel', key: 'channel', width: 12 },
      { header: 'Subject', key: 'subject', width: 30 },
      { header: 'Active', key: 'isActive', width: 10 },
    ],
  }),
);

const canReadNotifications = authorize(permission(RESOURCES.NOTIFICATIONS, ACTIONS.READ));
const canSendNotifications = authorize(permission(RESOURCES.NOTIFICATIONS, ACTIONS.CREATE));
const canUpdateNotifications = authorize(permission(RESOURCES.NOTIFICATIONS, ACTIONS.UPDATE));

// Part 8/15/47 — reuses the SAME `notifications:update` permission the
// admin template-edit action already requires, mirroring the coupon/
// prescription config precedent (a Super Admin can grant a specific
// Platform Admin configuration access without a brand new permission).
notificationsRouter.get(
  '/config',
  requireAuth,
  canUpdateNotifications,
  asyncHandler(async (_req, res) => sendSuccess(res, await getNotificationConfig())),
);
notificationsRouter.put(
  '/config',
  requireAuth,
  canUpdateNotifications,
  validate(z.record(z.string(), z.unknown())),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await setNotificationConfig(req.body, req.user!.id, req.user!.role)),
  ),
);

/** Part 31 — configuration presence only, never live-connectivity-tested, never secrets. */
notificationsRouter.get(
  '/providers/health',
  requireAuth,
  canReadNotifications,
  asyncHandler(async (_req, res) => sendSuccess(res, notificationService.getProviderHealth())),
);

/** Part 20 — safe mock-data preview, never real data. */
notificationsRouter.post(
  '/templates/:id/preview',
  requireAuth,
  canReadNotifications,
  asyncHandler(async (req, res) => sendSuccess(res, await notificationService.previewTemplate(req.params.id))),
);

/** Part 7/39/40 — dedicated activate/deactivate action so the audit trail records a precise ACTIVATED/DEACTIVATED event rather than a generic update. */
notificationsRouter.patch(
  '/templates/:id/status',
  requireAuth,
  canUpdateNotifications,
  validate(z.object({ isActive: z.boolean() })),
  asyncHandler(async (req, res) => {
    const updated = await notificationTemplateRepository.updateById(req.params.id, {
      isActive: req.body.isActive,
      updatedBy: req.user!.id,
    });
    await recordAudit({
      actorId: req.user!.id,
      actorType: actorTypeForRole(req.user!.role),
      action: req.body.isActive
        ? NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_TEMPLATE_ACTIVATED
        : NOTIFICATION_AUDIT_ACTIONS.NOTIFICATION_TEMPLATE_DEACTIVATED,
      resource: RESOURCES.NOTIFICATIONS,
      resourceId: req.params.id,
    });
    return sendSuccess(res, updated);
  }),
);

notificationsRouter.get(
  '/history',
  requireAuth,
  canReadNotifications,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit, filter } = req.query as unknown as ListQuery;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      NotificationHistoryModel.find(filter).sort({ sentAt: -1 }).skip(skip).limit(limit).lean(),
      NotificationHistoryModel.countDocuments(filter),
    ]);
    return sendPaginated(res, items, {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),
);

/** Part 24/39 — admin retry for a FAILED notification. */
notificationsRouter.post(
  '/history/:id/retry',
  requireAuth,
  canUpdateNotifications,
  asyncHandler(async (req, res) => {
    await notificationService.retryFailedNotification(req.params.id, req.user!.id, req.user!.role);
    return sendSuccess(res, { retried: true });
  }),
);

/** Customer-facing notification feed — own notifications only, not gated behind the admin `notifications:read` permission. */
notificationsRouter.get(
  '/mine',
  requireAuth,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { page, limit } = req.query as unknown as ListQuery;
    // unreadCount is also available standalone via GET /mine/unread-count
    // (for a header/nav badge that shouldn't require fetching a full page
    // of history) — kept off this list response since the shared
    // pagination envelope's `meta` shape is fixed across every paginated
    // endpoint in the app.
    const result = await notificationService.listMyNotifications(req.user!.id, page, limit);
    return sendPaginated(res, result.items, result.meta);
  }),
);

/** Part 53/54 — in-app notification-center unread badge. */
notificationsRouter.get(
  '/mine/unread-count',
  requireAuth,
  asyncHandler(async (req, res) =>
    sendSuccess(res, { count: await notificationService.getUnreadNotificationCount(req.user!.id) }),
  ),
);

notificationsRouter.patch(
  '/mine/read-all',
  requireAuth,
  asyncHandler(async (req, res) =>
    sendSuccess(res, { updated: await notificationService.markAllNotificationsRead(req.user!.id) }),
  ),
);

notificationsRouter.patch(
  '/mine/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    await notificationService.markNotificationRead(req.params.id, req.user!.id);
    return sendSuccess(res, { read: true });
  }),
);

/** Admin-triggered manual send — queues a job for the worker rather than sending synchronously. Rate-limited (Part 33) — an authenticated admin action, but still capable of triggering unbounded provider traffic without a cap. */
notificationsRouter.post(
  '/send',
  requireAuth,
  canSendNotifications,
  notificationSendRateLimiter,
  validate(sendNotificationSchema),
  asyncHandler(async (req, res) => {
    await notificationService.enqueueNotification(req.body);
    return sendSuccess(res, { queued: true });
  }),
);
