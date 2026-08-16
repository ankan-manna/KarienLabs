import { PAYMENT_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Unifies the Razorpay Order + Payment lifecycle into one record per checkout
 * attempt. Prompt 2 (prepaid-only redesign) — `orderId` is now `default: null`
 * (was `required: true`): a Payment is created BEFORE any Order exists (at
 * checkout-intent time), and is only ever linked to an Order once payment is
 * verified/captured AND the order has actually been finalized. A Payment
 * whose `orderId` stays `null` forever is exactly the "customer never
 * completed / cancelled / payment never succeeded" case — by construction,
 * no Order can exist for it.
 */
const paymentSchema = new Schema({
  // Indexed below via the explicit unique-partial `paymentSchema.index()`
  // call (not `index: true` here too — declaring both creates a duplicate/
  // conflicting index definition on the same path, which Mongoose warns
  // about and which can make `syncIndexes()` fail outright).
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  razorpayOrderId: { type: String, required: true, unique: true },
  razorpayPaymentId: { type: String, default: null, index: true },
  razorpaySignature: { type: String, default: null },
  amount: { type: Number, required: true, min: 0 }, // paise
  currency: { type: String, default: 'INR' },
  method: { type: String, default: '' }, // card, upi, netbanking, ...
  status: {
    type: String,
    enum: Object.values(PAYMENT_STATUS),
    default: PAYMENT_STATUS.PENDING,
    index: true,
  },
  failureReason: { type: String, default: '' },

  // Prompt 2 — the frozen checkout draft (validated cart/address/coupon/GST/
  // shipping/combo pricing, computed ONCE at checkout-intent time) this
  // payment is FOR. Order finalization (on payment capture) reuses this
  // EXACT snapshot rather than recomputing pricing — so the order total can
  // never disagree with the amount Razorpay actually captured, and a price
  // change between checkout-intent and payment completion never silently
  // alters what the customer is charged (see checkout-draft.util.ts).
  // `select: false` — large, internal-only, never needed on a normal read.
  checkoutSnapshot: { type: Schema.Types.Mixed, default: null, select: false },

  // Prompt 2 Part 24 — "payment succeeded at Razorpay but order finalization
  // failed" (inventory race, DB failure, coupon race). Payment.status stays
  // CAPTURED (the money genuinely was captured — never misrepresented as
  // failed), but this field being non-null flags the payment as needing
  // manual admin reconciliation/refund review. `null` in the overwhelming
  // common case (finalization succeeded on the first attempt).
  reconciliationError: { type: String, default: null },
});

// Prompt 2 — at most ONE order may ever be created from a given payment,
// enforced at the DATABASE level (not just an application-level `if`
// check), exactly the same partial-unique-index + duplicate-key-catch
// pattern already used for Shiprocket's `shiprocketOrderId` idempotency
// (shipment.model.ts) — reused here, not reinvented. A concurrent
// frontend-verify-callback + webhook race for the SAME payment can both
// attempt to finalize; only one `Order.create({paymentId: ...})` can win.
paymentSchema.index(
  { orderId: 1 },
  { unique: true, partialFilterExpression: { orderId: { $type: 'objectId' } } },
);

auditPlugin(paymentSchema);

export type PaymentDocument = InferSchemaType<typeof paymentSchema>;
export const PaymentModel = model('Payment', paymentSchema);
