import { NOTIFICATION_CATEGORIES, PAYMENT_STATUS } from '@medcommerce/shared';

import { logger } from '../../config/logger';
import { getRazorpayCredentials } from '../../integrations/razorpay/razorpay.client';
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  verifyPaymentSignature,
} from '../../integrations/razorpay/razorpay.service';
import { AppError, ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import { UserModel } from '../auth/models/user.model';
import { getAddressVerificationConfig } from '../customers/address-verification-config.service';
import { CustomerAddressModel } from '../customers/models/customer-address.model';
import { enqueueNotification, notifyAdmins } from '../notifications/notification.service';
import { OrderModel, type OrderDocument } from '../orders/models/order.model';
import {
  buildCheckoutDraft,
  finalizeOrderFromDraft,
  type CheckoutDraft,
  type CheckoutInput,
} from '../orders/order.service';
import { checkServiceabilityForCheckout } from '../orders/shiprocket-fulfillment.service';

import { PaymentLogModel } from './models/payment-log.model';
import { PaymentModel, type PaymentDocument } from './models/payment.model';

/**
 * Part 8/25/49/57 — the "payment successful" customer notification.
 * Called from `finalizePaymentIntoOrder`, the ONE shared function both the
 * client-side verify path and the Razorpay webhook funnel through — so
 * whichever path finalizes the order first "wins" and the notification is
 * only ever queued once for that order, never duplicated by the second
 * (redundant) path arriving later (Part 8's idempotency requirement).
 * Additionally idempotency-keyed (`PAYMENT_SUCCESS:<paymentId>`) as a second,
 * independent safety net.
 */
async function notifyPaymentCaptured(
  payment: PaymentDocument & { _id: unknown },
  order: OrderDocument & { _id: unknown },
): Promise<void> {
  const customer = await UserModel.findById(order.customerId).select('email name').lean();
  if (!customer?.email) return;

  await enqueueNotification({
    channel: 'email',
    templateKey: 'payment_success',
    recipient: customer.email,
    userId: String(order.customerId),
    orderId: String(order._id),
    category: NOTIFICATION_CATEGORIES.PAYMENT,
    idempotencyKey: `PAYMENT_SUCCESS:${String(payment._id)}`,
    data: {
      customerName: customer.name,
      orderNumber: order.orderNumber,
      amount: (payment.amount / 100).toFixed(2), // paise -> rupees for display
    },
  });
}

/**
 * Part 4/28/29/32 — the mandatory pre-payment address gate. Called
 * from `createCheckoutIntent` AFTER `buildCheckoutDraft` (so it sees the
 * FRESH, just-resolved address/pincode/seller for THIS checkout attempt —
 * never a cached/stale answer from whenever the address was first saved)
 * and BEFORE `createRazorpayOrder` (so a failure here creates no Razorpay
 * order, no Payment row, nothing to reconcile — prepaid-only ordering is
 * preserved exactly as established it, this only adds an earlier
 * exit, not a new step interleaved with order/payment creation).
 * Independently config-gated (Part 44/45): each of the three checks below
 * only runs if its own toggle is on, so a super admin can require any
 * subset of {mobile verified, pincode verified, Shiprocket-serviceable}.
 */
async function assertAddressReadyForCheckout(draft: CheckoutDraft): Promise<void> {
  const cfg = await getAddressVerificationConfig();
  if (!cfg.mobileVerificationEnabled && !cfg.pincodeValidationEnabled && !cfg.serviceabilityCheckEnabled) {
    return;
  }

  if (cfg.mobileVerificationEnabled || cfg.pincodeValidationEnabled) {
    const address = await CustomerAddressModel.findById(draft.addressId).select('mobileVerified pincodeVerified').lean();
    if (!address) throw new NotFoundError('Address');

    if (cfg.mobileVerificationEnabled && !address.mobileVerified) {
      throw new UnprocessableEntityError(
        'Please verify this address’s phone number (OTP) before checkout.',
      );
    }
    if (cfg.pincodeValidationEnabled && !address.pincodeVerified) {
      throw new UnprocessableEntityError(
        'This address’s pincode could not be verified. Please re-check and save it again.',
      );
    }
  }

  if (cfg.serviceabilityCheckEnabled) {
    const result = await checkServiceabilityForCheckout({
      pincode: draft.shippingAddress.pincode,
      sellerId: draft.sellerId,
      totalWeightGrams: undefined,
    });
    if (!result.serviceable) {
      // `no_couriers` is the only reason that's an actual answer from
      // Shiprocket about THIS pincode — everything else (`not_configured`,
      // `no_warehouse`, `authentication_failed`, `api_unreachable`) is an
      // integration/environment failure that never asked Shiprocket about
      // the pincode at all, so it must never be presented to the customer as
      // "we don't deliver here." Both still block checkout (serviceability
      // stays mandatory either way) but with an honest, retryable message
      // for the latter case.
      //
      // Bugfix (Human-Readable API Logging) Part 8 — each `reason` now maps
      // to its OWN `error.code`, not one shared generic `UNPROCESSABLE_ENTITY`,
      // so a Shiprocket credentials problem is distinguishable in the
      // response/logs from a genuine "not deliverable" answer, even though
      // the customer-facing MESSAGE for the failure-mode cases is
      // deliberately identical (Part 18/19 — safe, honest, non-technical).
      if (result.reason === 'no_couriers') {
        throw new UnprocessableEntityError(
          'We currently do not deliver to this address. Please choose a different address.',
          undefined,
          'PINCODE_NOT_SERVICEABLE',
        );
      }
      const code =
        result.reason === 'authentication_failed'
          ? 'SHIPROCKET_AUTHENTICATION_FAILED'
          : result.reason === 'not_configured'
            ? 'SHIPROCKET_NOT_CONFIGURED'
            : result.reason === 'no_warehouse'
              ? 'NO_FULFILLING_WAREHOUSE'
              : 'SHIPROCKET_UNREACHABLE';
      throw new UnprocessableEntityError(
        'Delivery availability could not be verified right now. Please try again later.',
        undefined,
        code,
        { integration: 'shiprocket', operation: 'check_serviceability', reason: result.reason },
      );
    }
  }
}

/**
 * (prepaid-only redesign) Part 1 — checkout Phase 1: validate the
 * cart/address/coupon/combo/GST/shipping/prescription rules (via the
 * existing, unchanged `buildCheckoutDraft`), compute the authoritative
 * amount, create a Razorpay order for EXACTLY that amount, and persist a
 * `Payment{status: pending, orderId: null}` carrying the frozen draft.
 *
 * Deliberately creates NO Order and deducts NO inventory — see
 * order.service.ts's `finalizeOrderFromDraft` doc comment for why (Part 6:
 * atomic deduction at payment-verified time is the safe option compatible
 * with this codebase's existing FEFO mechanism, since no reservation-hold
 * system exists to extend). If the customer never completes payment, this
 * Payment simply stays `pending` forever and NOTHING else in the system
 * ever references it — no order, no stock change, no coupon consumption,
 * no cart mutation.
 */
export async function createCheckoutIntent(userId: string, input: CheckoutInput) {
  const draft = await buildCheckoutDraft(userId, input);

  await assertAddressReadyForCheckout(draft);

  const amountInPaise = Math.round(draft.totals.grandTotal * 100);
  if (amountInPaise <= 0) {
    throw new UnprocessableEntityError('Checkout amount must be greater than zero');
  }

  const receipt = `chk-${Date.now()}-${userId.slice(-8)}`.slice(0, 40);
  const razorpayOrder = await createRazorpayOrder({ amountInPaise, receipt });

  const payment = await PaymentModel.create({
    razorpayOrderId: razorpayOrder.id,
    amount: amountInPaise,
    status: PAYMENT_STATUS.PENDING,
    checkoutSnapshot: draft,
  });

  // Bugfix (Human-Readable API Logging) Part 14 — one of the explicit
  // checkout/payment lifecycle events the  asks to be distinguishable
  // in logs (checkout intent created / payment initiated / cancelled /
  // failed / successful / order created / inventory allocated). Business
  // identifiers only (paymentId, razorpayOrderId, amount) — never the full
  // checkout snapshot (address/items/coupon), matching Part 5/12.
  logger.info(
    {
      paymentId: String(payment._id),
      razorpayOrderId: razorpayOrder.id,
      amount: amountInPaise,
      currency: 'INR',
    },
    'Checkout intent created',
  );

  // Razorpay's `key_id` is a PUBLIC identifier (unlike `key_secret`/`webhookSecret`,
  // which never leave the backend) — it's meant to be embedded in the client-side
  // Checkout widget. Resolved the same way the backend resolves its own client so a
  // DB-configured key rotation is picked up without a frontend redeploy.
  const { keyId } = await getRazorpayCredentials();

  return { razorpayOrder, payment, keyId };
}

export interface FinalizePaymentResult {
  /** `true` once an Order actually exists for this payment (whether just now or previously). */
  finalized: boolean;
  order: (OrderDocument & { _id: unknown }) | null;
  /** Part 24 — payment WAS captured at Razorpay, but order finalization hasn't succeeded (yet). Money is not lost; this payment needs reconciliation. Never returned as a hard error to the caller. */
  reconciling: boolean;
}

/**
 * THE single authoritative "turn a captured payment into a confirmed order"
 * function — called from BOTH `verifyAndCapturePayment` (frontend) and
 * `handleRazorpayWebhookEvent` (`payment.captured`), since either can
 * legitimately be the first to observe a capture (Part 18/26: pick one
 * authoritative finalization path while letting the other safely
 * reconcile — this IS that shared path, not two separate implementations
 * racing each other).
 *
 * Idempotent by construction: `finalizeOrderFromDraft` (order.service.ts)
 * itself guarantees at most one Order per payment via a database-level
 * unique index, so calling this function twice for the same payment
 * (frontend callback + webhook, or a retried request) is always safe and
 * never creates a duplicate order, double-deducts inventory, or
 * double-redeems a coupon.
 *
 * Part 24 — if payment is captured but `finalizeOrderFromDraft` itself
 * fails (inventory race, coupon race, transient DB error), this NEVER
 * reports the payment as failed (the money genuinely was captured). Instead
 * it records `Payment.reconciliationError` and alerts admins, returning
 * `{reconciling: true}` so the caller can show the customer a safe
 * "payment received, we're finalizing your order" state rather than a false
 * failure or a false success.
 */
export async function finalizePaymentIntoOrder(
  payment: PaymentDocument & { _id: unknown },
): Promise<FinalizePaymentResult> {
  const existingOrder = await OrderModel.findOne({ paymentId: payment._id });
  if (existingOrder) return { finalized: true, order: existingOrder, reconciling: false };

  const draft = (payment as unknown as { checkoutSnapshot: CheckoutDraft }).checkoutSnapshot;
  if (!draft) {
    // Should be structurally impossible (every Payment is created WITH a
    // snapshot in createCheckoutIntent) — surfaced loudly rather than
    // silently doing nothing, since this would otherwise look like a
    // "payment captured, order stuck forever" case with no path forward.
    logger.error({ paymentId: String(payment._id) }, 'Payment has no checkoutSnapshot — cannot finalize order');
    await PaymentModel.updateOne(
      { _id: payment._id },
      { reconciliationError: 'Missing checkout snapshot — cannot finalize order' },
    );
    return { finalized: false, order: null, reconciling: true };
  }

  try {
    const { order, alreadyExisted } = await finalizeOrderFromDraft(draft, String(payment._id));
    if (!alreadyExisted) {
      // Part 14 — "order created" is its own distinguishable event from
      // "payment successful" (a payment can succeed while order finalization
      // is still in-flight/reconciling — see the doc comment above).
      // Inventory-allocation logging lives at the actual decrement call
      // site (order.service.ts::decrementStockFifo, Part 13), not
      // duplicated here.
      logger.info(
        { orderId: String(order._id), orderNumber: order.orderNumber, paymentId: String(payment._id) },
        'Order created',
      );
      await notifyPaymentCaptured(payment, order);
    }
    if (payment.reconciliationError) {
      // A PRIOR attempt failed and left this flagged — this retry (webhook
      // reconciliation, or admin-triggered) succeeded, so clear the flag.
      await PaymentModel.updateOne({ _id: payment._id }, { reconciliationError: null });
    }
    return { finalized: true, order, reconciling: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown order finalization error';
    logger.error(
      { paymentId: String(payment._id), err },
      'Payment captured but order finalization failed — flagged for reconciliation',
    );
    await PaymentModel.updateOne({ _id: payment._id }, { reconciliationError: message });

    const draftSnapshot = draft as CheckoutDraft;
    await notifyAdmins({
      templateKey: 'payment_reconciliation_admin',
      data: {
        paymentId: String(payment._id),
        razorpayOrderId: payment.razorpayOrderId,
        amount: (payment.amount / 100).toFixed(2),
        reason: message,
        userId: draftSnapshot.userId,
      },
    });

    return { finalized: false, order: null, reconciling: true };
  }
}

interface VerifyPaymentInput {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export interface VerifyPaymentResult {
  verified: true;
  status: 'confirmed' | 'processing';
  orderId: string | null;
  orderNumber: string | null;
}

/**
 * the frontend-return path. The backend is authoritative for
 * EVERYTHING here (Part 3/27): the HMAC signature is verified against our
 * own secret (never trusts the browser's claim of success), the captured
 * amount is cross-checked against Razorpay's own record of the payment
 * (Part 4), and finalization goes through the SAME shared, idempotent
 * `finalizePaymentIntoOrder` the webhook uses — this endpoint is a
 * convenience for a fast UI response, never a second source of truth.
 */
export async function verifyAndCapturePayment(
  input: VerifyPaymentInput,
  userId: string,
): Promise<VerifyPaymentResult> {
  await verifyPaymentSignature({
    orderId: input.razorpayOrderId,
    paymentId: input.razorpayPaymentId,
    signature: input.razorpaySignature,
  });

  const payment = await PaymentModel.findOne({ razorpayOrderId: input.razorpayOrderId }).select(
    '+checkoutSnapshot',
  );
  if (!payment) throw new NotFoundError('Payment');

  const draft = (payment as unknown as { checkoutSnapshot: CheckoutDraft }).checkoutSnapshot;
  if (!draft || draft.userId !== userId) {
    // Ownership boundary — a customer may only verify/finalize a
    // checkout-intent THEY created (mirrors the old check, which compared
    // against `Order.customerId`; there's no Order yet at this point, so the
    // frozen snapshot's userId is the authoritative owner instead).
    throw new ForbiddenError('You do not have access to this payment');
  }

  // Already fully processed by an earlier call (client retry, or the
  // webhook already won the race) — idempotent no-op, no re-verification
  // side effects, no duplicate anything.
  const existingOrder = await OrderModel.findOne({ paymentId: payment._id });
  if (existingOrder) {
    return {
      verified: true,
      status: 'confirmed',
      orderId: String(existingOrder._id),
      orderNumber: existingOrder.orderNumber,
    };
  }

  // Part 4 — cross-check the ACTUAL captured amount/order at Razorpay
  // against our own authoritative `Payment.amount` (computed server-side
  // from the checkout draft, never a client-supplied figure). This is
  // defense-in-depth on top of a guarantee that's already structurally
  // enforced by the signature check above: `verifyPaymentSignature`'s HMAC
  // is computed as `HMAC(secret, razorpayOrderId|razorpayPaymentId)`, and
  // Razorpay will only ever produce a payment capture (and therefore a
  // valid signature) for a payment made against the FIXED amount that
  // specific order was created with — so a mismatched amount is already
  // cryptographically excluded by this point. Because of that, a failure
  // to reach Razorpay's API for this EXTRA check (network hiccup, rate
  // limit) is logged and treated as "unable to confirm, proceeding on the
  // already-verified signature" rather than blocking a legitimate payment —
  // this call must never become a new single point of failure for the
  // whole payment flow. A call that SUCCEEDS but reports a mismatch is a
  // genuine anomaly and is always rejected.
  try {
    const fetched = await fetchRazorpayPayment(input.razorpayPaymentId);
    if (fetched.orderId !== payment.razorpayOrderId || fetched.amount !== payment.amount) {
      logger.error(
        {
          paymentId: String(payment._id),
          expectedAmount: payment.amount,
          actualAmount: fetched.amount,
        },
        'Razorpay payment amount/order mismatch — refusing to finalize',
      );
      throw new AppError(
        400,
        'PAYMENT_AMOUNT_MISMATCH',
        'Payment amount does not match the expected checkout total',
      );
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.warn(
      { paymentId: String(payment._id), err },
      'Could not reach Razorpay to cross-check payment amount — proceeding on the already-verified HMAC signature alone',
    );
  }

  if (payment.status !== PAYMENT_STATUS.CAPTURED) {
    payment.razorpayPaymentId = input.razorpayPaymentId;
    payment.razorpaySignature = input.razorpaySignature;
    payment.status = PAYMENT_STATUS.CAPTURED;
    await payment.save();

    // Part 14 — "payment successful", distinct from "order created" below
    // (finalization can legitimately fail/reconcile-later even though the
    // payment itself genuinely succeeded — Part 24's whole point).
    logger.info(
      {
        paymentId: String(payment._id),
        razorpayPaymentId: input.razorpayPaymentId,
        amount: payment.amount,
        currency: 'INR',
        status: 'success',
      },
      'Payment successful',
    );
  }

  const result = await finalizePaymentIntoOrder(payment);
  if (result.reconciling || !result.order) {
    // Part 24/29 — payment WAS captured; never tell the customer it failed.
    // The frontend must show a "payment received, finalizing your order"
    // state, not a success page and not an error page.
    return { verified: true, status: 'processing', orderId: null, orderNumber: null };
  }

  return {
    verified: true,
    status: 'confirmed',
    orderId: String(result.order._id),
    orderNumber: result.order.orderNumber,
  };
}

/** Source of truth for payment state — handles cases where the client closes the browser mid-payment. */
export async function handleRazorpayWebhookEvent(event: { event: string; payload: unknown }) {
  await PaymentLogModel.create({ event: event.event, payload: event.payload });

  const entity = (event.payload as { payment?: { entity?: Record<string, unknown> } }).payment
    ?.entity;
  if (!entity) return;

  const razorpayOrderId = entity.order_id as string | undefined;
  if (!razorpayOrderId) return;

  const payment = await PaymentModel.findOne({ razorpayOrderId }).select('+checkoutSnapshot');
  if (!payment) return;

  if (event.event === 'payment.captured') {
    if (payment.status !== PAYMENT_STATUS.CAPTURED) {
      payment.razorpayPaymentId = entity.id as string;
      payment.status = PAYMENT_STATUS.CAPTURED;
      payment.method = (entity.method as string) ?? '';
      await payment.save();
    }
    // Idempotent regardless of whether the frontend-verify path already won
    // this race — see finalizePaymentIntoOrder's doc comment.
    await finalizePaymentIntoOrder(payment);
  } else if (event.event === 'payment.failed') {
    if (payment.status === PAYMENT_STATUS.CAPTURED) {
      // A capture can't un-happen; a late/out-of-order `payment.failed`
      // delivery for an already-captured payment is ignored rather than
      // incorrectly overwriting a real success.
      return;
    }
    payment.status = PAYMENT_STATUS.FAILED;
    payment.failureReason = (entity.error_description as string) ?? 'Payment failed';
    await payment.save();

    // Part 14/15 — a declined/failed customer payment is a normal business
    // outcome, not a system fault — WARN, not ERROR (Part 15's own example:
    // "Invalid pincode entered by customer -> INFO/WARN", same category).
    logger.warn(
      { paymentId: String(payment._id), razorpayOrderId, reason: payment.failureReason, status: 'failed' },
      'Payment failed',
    );

    // no Order exists to fail/compensate (that's the entire
    // point of the prepaid-only redesign): a failed payment simply never
    // produces one. Only notifications remain.
    const draft = (payment as unknown as { checkoutSnapshot: CheckoutDraft | null }).checkoutSnapshot;
    if (draft) {
      const customer = await UserModel.findById(draft.userId).select('email name').lean();
      if (customer?.email) {
        await enqueueNotification({
          channel: 'email',
          templateKey: 'payment_failed_customer',
          recipient: customer.email,
          userId: draft.userId,
          category: NOTIFICATION_CATEGORIES.PAYMENT,
          idempotencyKey: `PAYMENT_FAILED:${String(payment._id)}`,
          data: { customerName: customer.name, reason: payment.failureReason },
        });
      }
      await notifyAdmins({
        templateKey: 'payment_failed_admin',
        data: {
          orderNumber: '(no order — payment failed before order creation)',
          reason: payment.failureReason,
          customerName: customer?.name ?? 'Unknown customer',
        },
      });
    }
  }
}
