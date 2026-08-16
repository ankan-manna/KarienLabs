import express, { Router } from 'express';

import { logger } from '../../config/logger';
import { verifyWebhookSignature } from '../../integrations/razorpay/razorpay.service';
import { getShiprocketWebhookToken } from '../../integrations/shiprocket/shiprocket.client';
import { AppError } from '../../utils/app-error';
import { asyncHandler } from '../../utils/async-handler';
import { safeCompare } from '../../utils/safe-compare.util';
import { processShiprocketWebhookEvent } from '../orders/shiprocket-fulfillment.service';

import { handleRazorpayWebhookEvent } from './payment.service';

export const webhookRouter = Router();

/**
 * Mounted with `express.raw()` (not `express.json()`) because HMAC verification
 * must run against the exact raw request bytes Razorpay signed — parsing/re-stringifying
 * JSON first would produce a different byte sequence and fail verification.
 */
webhookRouter.post(
  '/razorpay',
  express.raw({ type: 'application/json' }),
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    if (typeof signature !== 'string') {
      throw new AppError(400, 'MISSING_WEBHOOK_SIGNATURE', 'Missing X-Razorpay-Signature header');
    }

    const rawBody = (req.body as Buffer).toString('utf8');
    await verifyWebhookSignature(rawBody, signature);

    const event = JSON.parse(rawBody);
    logger.info({ event: event.event }, 'Razorpay webhook received');

    await handleRazorpayWebhookEvent(event);

    res.status(200).json({ received: true });
  }),
);

/**
 * Shiprocket webhooks (Part 22/34) — unlike Razorpay's HMAC-over-raw-body
 * scheme, Shiprocket authenticates webhook deliveries with a static token
 * configured in their dashboard, echoed back on a request header; `express.json()`
 * is fine here since no raw-byte signature verification is needed. Never
 * trusts the payload blindly (Part 22): the token is checked FIRST, then
 * every event is deduplicated/audited inside processShiprocketWebhookEvent
 * before any shipment/order state changes.
 *
 * Prompt 24 fix — this previously FAILED OPEN: `if (expectedToken && ...)`
 * skipped the whole check (accepting ANY unauthenticated payload) whenever
 * the webhook token wasn't configured yet. An unconfigured secret must
 * reject every request, not silently trust them — same "fail closed"
 * principle as every other credential check in this codebase. Comparison
 * is now constant-time (`safeCompare`), matching the Razorpay path above,
 * rather than a plain `!==` on a shared secret.
 */
webhookRouter.post(
  '/shiprocket',
  express.json(),
  asyncHandler(async (req, res) => {
    const expectedToken = await getShiprocketWebhookToken();
    const providedToken = req.headers['x-api-key'] || req.headers['x-shiprocket-token'];

    if (!expectedToken || typeof providedToken !== 'string' || !safeCompare(providedToken, expectedToken)) {
      throw new AppError(401, 'INVALID_WEBHOOK_TOKEN', 'Invalid Shiprocket webhook token');
    }

    await processShiprocketWebhookEvent(req.body);

    res.status(200).json({ received: true });
  }),
);
