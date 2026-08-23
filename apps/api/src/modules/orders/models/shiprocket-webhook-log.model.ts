import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Part 22 — every received Shiprocket webhook delivery is logged
 * here BEFORE processing, keyed on a dedup fingerprint (awb + status +
 * shiprocket's own event timestamp if present) so an exact-duplicate
 * redelivery (Shiprocket retries on any non-2xx, or the same event genuinely
 * fired twice) is detected and skipped rather than reapplied. This is also
 * exactly the kind of "Logs" record the later S3/log-retention architecture
 * (Part 32) targets — a 20-day TTL index is applied now so this collection
 * is already compatible with that policy rather than needing a migration
 * later.
 */
const shiprocketWebhookLogSchema = new Schema({
  dedupKey: { type: String, required: true },
  awbCode: { type: String, default: '' },
  shiprocketOrderId: { type: String, default: '' },
  statusRaw: { type: String, default: '' },
  processed: { type: Boolean, default: false },
  error: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

shiprocketWebhookLogSchema.index({ dedupKey: 1 }, { unique: true });
// 20 days, in seconds — matches the platform-wide log-retention policy
// referenced in Part 32 (full S3-backed log lifecycle is a later
// item; this collection is deliberately already compliant with it).
shiprocketWebhookLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 20 });

export type ShiprocketWebhookLogDocument = InferSchemaType<typeof shiprocketWebhookLogSchema>;
export const ShiprocketWebhookLogModel = model(
  'ShiprocketWebhookLog',
  shiprocketWebhookLogSchema,
);
