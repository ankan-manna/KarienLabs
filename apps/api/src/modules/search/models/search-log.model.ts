import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Prompt 23 Part 33/34/42 — one row per product-search request, the source
 * of truth for "popular searches" and "zero-result searches" admin
 * analytics. Deliberately minimal: only the NORMALIZED query text (never the
 * raw customer-typed string, which could contain PII if a customer searches
 * their own name/phone/etc. — see search-normalize.util.ts) plus a result
 * count and an OPTIONAL actor reference. No IP address, no user agent, no
 * free-text — Part 33's "do not store unnecessary sensitive customer data"
 * and Part 42's "do not log unnecessary customer PII" apply equally to what
 * gets PERSISTED here, not just what gets pino-logged.
 *
 * TTL'd at 180 days, matching NotificationHistoryModel's retention window —
 * search-trend data older than that has no real operational value and
 * shouldn't accumulate indefinitely.
 */
const searchLogSchema = new Schema({
  normalizedQuery: { type: String, required: true, trim: true, index: true },
  resultCount: { type: Number, required: true, min: 0 },
  hasResults: { type: Boolean, required: true, index: true },
  // Optional — set only for an authenticated request; anonymous/guest
  // searches (the majority) leave this null. Never required for the
  // popular/zero-result aggregations, which group by query text only.
  actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  // NOT `index: true` here — the explicit `.index({ createdAt: 1 }, { expireAfterSeconds })`
  // below already covers this field, and Mongoose would otherwise generate
  // TWO indexes both named `createdAt_1` with conflicting options (one with
  // TTL, one without), which `Model.syncIndexes()` rejects outright with
  // `IndexOptionsConflict` — caught live via the integration-test harness's
  // startup `syncIndexes()` call.
  createdAt: { type: Date, default: Date.now },
});

searchLogSchema.index({ hasResults: 1, createdAt: -1 });
searchLogSchema.index({ normalizedQuery: 1, createdAt: -1 });
searchLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

export type SearchLogDocument = InferSchemaType<typeof searchLogSchema>;
export const SearchLogModel = model('SearchLog', searchLogSchema);
