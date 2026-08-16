import { CounterModel } from '../modules/shared/models/counter.model';

/** Atomic per-key counter (findOneAndUpdate $inc, upsert) — safe under concurrent writers, unlike reading-then-incrementing in application code. */
async function nextSeq(key: string): Promise<number> {
  const counter = await CounterModel.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true },
  );
  return counter.seq;
}

/**
 * e.g. generateSequenceNumber('order', 'ORD') -> "ORD-2026-000123"
 *
 * `scope` (optional, Prompt 11) namespaces the counter — e.g.
 * generateSequenceNumber('invoice', 'INV', sellerId) uses a distinct counter
 * per seller instead of one global counter, so seller-scoped numbering
 * (INV-A-000001 / INV-B-000001, per docs/DEVELOPMENT_TASKS.md's seller
 * invoice-numbering requirement) is a call-site change, not a new counter
 * mechanism. Callers that don't pass `scope` keep using the single global
 * counter exactly as before — this is purely additive. The actual GST/invoice
 * prompt is what will start passing `scope`; this prompt only prepares the
 * capability.
 */
export async function generateSequenceNumber(
  key: string,
  prefix: string,
  scope?: string | null,
): Promise<string> {
  const counterKey = scope ? `${key}:${scope}` : key;
  const seq = await nextSeq(counterKey);
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}
