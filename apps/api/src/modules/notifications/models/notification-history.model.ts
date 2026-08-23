import { NOTIFICATION_CHANNELS, NOTIFICATION_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

/** Terminal record moved here once a NotificationQueue job finishes — keeps the queue collection small and hot. TTL'd 180 days. */
const notificationHistorySchema = new Schema({
  channel: { type: String, enum: Object.values(NOTIFICATION_CHANNELS), required: true },
  templateKey: { type: String, required: true },
  recipient: { type: String, required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  // Part 21/42/48 — carried over from NotificationQueue when set,
  // so admin history and the customer notification center can filter/link
  // by order without ever needing to read the (intentionally-dropped) `data` payload.
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
  status: { type: String, enum: Object.values(NOTIFICATION_STATUS), required: true },
  // Part 24/39 — cross-reference to the originating
  // NotificationQueue document. On FAILURE the queue doc is deliberately
  // KEPT (not deleted — see notification.worker.ts), since it's the only
  // place the original template `data` still lives (History intentionally
  // never stores it — Part 21's "do not store sensitive payloads
  // unnecessarily"). The admin retry endpoint uses this to find and
  // re-enqueue the same queue doc rather than needing the raw data again.
  queueId: { type: Schema.Types.ObjectId, ref: 'NotificationQueue', default: null },
  // Part 21/42 — a SAFE, human-readable failure reason only
  // (never a raw provider error object, which could contain request/response
  // internals) — see notification.worker.ts's error handling.
  errorCode: { type: String, default: '' },
  // Part 25/43 — mirrors NotificationQueue's idempotencyKey so a
  // duplicate-suppression check survives past the queue doc's deletion
  // (which happens immediately on successful send).
  idempotencyKey: { type: String, default: null },
  // Part 53/54 — the in-app "notification center" read/unread
  // state. Only meaningful for `userId`-attributed rows; admin-wide/system
  // rows with no `userId` are never shown as "unread" to anyone.
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  sentAt: { type: Date, default: Date.now },
});

notificationHistorySchema.index({ userId: 1, sentAt: -1 });
notificationHistorySchema.index({ userId: 1, isRead: 1 });
notificationHistorySchema.index({ idempotencyKey: 1 }, { sparse: true });
notificationHistorySchema.index({ sentAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export type NotificationHistoryDocument = InferSchemaType<typeof notificationHistorySchema>;
export const NotificationHistoryModel = model('NotificationHistory', notificationHistorySchema);
