import { NOTIFICATION_CHANNELS, NOTIFICATION_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * One schema for email/SMS/push — the three only differ by `channel`, so a unified
 * queue avoids three copy-pasted collections. Consumed by a BullMQ worker (same
 * pattern as invoice generation, see apps/api/src/queues/workers/invoice.worker.ts).
 */
const notificationQueueSchema = new Schema({
  channel: {
    type: String,
    enum: Object.values(NOTIFICATION_CHANNELS),
    required: true,
    index: true,
  },
  templateKey: { type: String, required: true },
  recipient: { type: String, required: true }, // email address, phone number, or device token
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  // Part 21/48 — carried through to NotificationHistory once sent,
  // so admin history/customer notification-center views can filter/link
  // back to the originating order without joining through `data`.
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null, index: true },
  data: { type: Schema.Types.Mixed, default: {} }, // template variables
  status: {
    type: String,
    enum: Object.values(NOTIFICATION_STATUS),
    default: NOTIFICATION_STATUS.QUEUED,
    index: true,
  },
  attempts: { type: Number, default: 0 },
  lastError: { type: String, default: '' },
  // Part 25/57 — e.g. `PAYMENT_SUCCESS:<paymentId>`. See the
  // PARTIAL index below (not a plain `sparse` index — see that index's
  // comment for why) so most rows (no key given) are unaffected, but two
  // enqueue calls with the SAME key can never both create a queue doc — see
  // notification.service.ts's enqueueNotification, which catches the
  // resulting duplicate-key error as "already enqueued, no-op."
  idempotencyKey: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
});

notificationQueueSchema.index({ status: 1, createdAt: 1 });
// A plain `{ unique: true, sparse: true }` index does NOT do what it looks
// like it does here: Mongoose's `default: null` means `idempotencyKey` is
// ALWAYS present on every document (with value `null`, not genuinely
// absent) — "sparse" only excludes documents where the field is truly
// MISSING, so a plain sparse+unique index would still collide on every
// SECOND document with no idempotency key at all (`null === null`), which
// is most notifications. A PARTIAL index with an explicit filter
// (`$type: 'string'`) is the correct fix — it only enforces uniqueness
// among documents that actually HAVE a real string key, exactly the
// intended behavior.
notificationQueueSchema.index(
  { idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } },
);

export type NotificationQueueDocument = InferSchemaType<typeof notificationQueueSchema>;
export const NotificationQueueModel = model('NotificationQueue', notificationQueueSchema);
