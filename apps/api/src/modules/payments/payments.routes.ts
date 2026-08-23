import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { sensitiveAccountActionRateLimiter } from '../../middlewares/rate-limit.middleware';
import { sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../utils/validate';
import { checkoutSchema } from '../orders/order.validator';

import * as paymentService from './payment.service';

export const paymentsRouter = Router();

const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

/**
 * (prepaid-only redesign) — checkout Phase 1. Replaces the old
 * `POST /orders/checkout` + `POST /payments/razorpay/order` two-step (which
 * created a real Order before any payment happened — the exact bug this
 * redesign eliminates). Validates the cart/address/coupon/combo/GST/shipping
 * rules and creates a Razorpay order for the authoritative amount; creates
 * NO Order and deducts NO inventory (see payment.service.ts::createCheckoutIntent).
 * Rate-limited like other sensitive account actions — a checkout-intent
 * creates a real (if short-lived) Razorpay order each call.
 */
paymentsRouter.post(
  '/checkout-intent',
  requireAuth,
  sensitiveAccountActionRateLimiter,
  validate(checkoutSchema),
  asyncHandler(async (req, res) => {
    return sendCreated(res, await paymentService.createCheckoutIntent(req.user!.id, req.body));
  }),
);

paymentsRouter.post(
  '/razorpay/verify',
  requireAuth,
  validate(verifyPaymentSchema),
  asyncHandler(async (req, res) => {
    const result = await paymentService.verifyAndCapturePayment(
      {
        razorpayOrderId: req.body.razorpay_order_id,
        razorpayPaymentId: req.body.razorpay_payment_id,
        razorpaySignature: req.body.razorpay_signature,
      },
      req.user!.id,
    );
    return sendSuccess(res, result);
  }),
);
