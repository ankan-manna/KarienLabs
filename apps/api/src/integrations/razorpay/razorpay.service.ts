import { createHmac } from 'crypto';

import { AppError } from '../../utils/app-error';
import { safeCompare } from '../../utils/safe-compare.util';
import { logThirdPartyApiCall } from '../logging/third-party-metrics.logger';

import { getRazorpayClient, getRazorpayCredentials } from './razorpay.client';

interface CreateOrderInput {
  /** Amount in the smallest currency unit (paise), computed server-side — never trust a client amount. */
  amountInPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}

export async function createRazorpayOrder(input: CreateOrderInput) {
  const client = await getRazorpayClient();
  const startedAt = Date.now();
  try {
    const order = await client.orders.create({
      amount: input.amountInPaise,
      currency: input.currency ?? 'INR',
      receipt: input.receipt,
      notes: input.notes,
    });
    logThirdPartyApiCall({
      service: 'razorpay',
      endpoint: 'orders.create',
      method: 'POST',
      durationMs: Date.now() - startedAt,
      success: true,
    });
    return order;
  } catch (error) {
    logThirdPartyApiCall({
      service: 'razorpay',
      endpoint: 'orders.create',
      method: 'POST',
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

function hmacHex(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

interface VerifyPaymentInput {
  orderId: string;
  paymentId: string;
  signature: string;
}

/** Verifies the checkout-handler signature. Payment is only trusted server-side after this passes. */
export async function verifyPaymentSignature({
  orderId,
  paymentId,
  signature,
}: VerifyPaymentInput): Promise<void> {
  const { keySecret } = await getRazorpayCredentials();
  const expected = hmacHex(keySecret, `${orderId}|${paymentId}`);
  if (!safeCompare(expected, signature)) {
    throw new AppError(400, 'INVALID_PAYMENT_SIGNATURE', 'Payment signature verification failed');
  }
}

/**
 * Verifies the `X-Razorpay-Signature` header on incoming webhooks.
 *
 * Part 34 fix — fail CLOSED when `webhookSecret` is unconfigured
 * (empty string). Previously an empty secret would still compute
 * `hmac('', rawBody)` and compare it against the caller-supplied header —
 * HMAC with a known/empty key is just a deterministic function of the
 * payload, so anyone could compute the "expected" value themselves and
 * forge a passing signature. An unconfigured secret must reject every
 * webhook, not silently accept forgeable ones.
 */
export async function verifyWebhookSignature(rawBody: string, signatureHeader: string): Promise<void> {
  const { webhookSecret } = await getRazorpayCredentials();
  if (!webhookSecret) {
    throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Razorpay webhook secret is not configured');
  }
  const expected = hmacHex(webhookSecret, rawBody);
  if (!safeCompare(expected, signatureHeader)) {
    throw new AppError(400, 'INVALID_WEBHOOK_SIGNATURE', 'Webhook signature verification failed');
  }
}

/**
 * Part 4 — explicit, belt-and-suspenders confirmation that the
 * amount actually captured at Razorpay matches what we expect (our own
 * server-computed `Payment.amount`, never a client-supplied figure).
 * Razorpay already structurally prevents a payment from capturing against
 * an order for anything other than the fixed amount that order was created
 * with (see `createRazorpayOrder` — we set that amount ourselves), so this
 * is defense-in-depth rather than the only guard, but it's a real, explicit
 * check rather than an implicit assumption.
 */
export async function fetchRazorpayPayment(paymentId: string): Promise<{
  amount: number;
  orderId: string | null;
  status: string;
}> {
  const client = await getRazorpayClient();
  const startedAt = Date.now();
  try {
    const payment = await client.payments.fetch(paymentId);
    logThirdPartyApiCall({
      service: 'razorpay',
      endpoint: 'payments.fetch',
      method: 'GET',
      durationMs: Date.now() - startedAt,
      success: true,
    });
    return {
      amount: Number(payment.amount),
      orderId: payment.order_id ?? null,
      status: payment.status,
    };
  } catch (error) {
    logThirdPartyApiCall({
      service: 'razorpay',
      endpoint: 'payments.fetch',
      method: 'GET',
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

export async function refundPayment(paymentId: string, amountInPaise?: number) {
  const client = await getRazorpayClient();
  const startedAt = Date.now();
  try {
    const refund = await client.payments.refund(paymentId, amountInPaise ? { amount: amountInPaise } : {});
    logThirdPartyApiCall({
      service: 'razorpay',
      endpoint: 'payments.refund',
      method: 'POST',
      durationMs: Date.now() - startedAt,
      success: true,
    });
    return refund;
  } catch (error) {
    logThirdPartyApiCall({
      service: 'razorpay',
      endpoint: 'payments.refund',
      method: 'POST',
      durationMs: Date.now() - startedAt,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
