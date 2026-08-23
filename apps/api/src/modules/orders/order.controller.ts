import type { OrderStatus } from '@medcommerce/shared';
import type { Request } from 'express';

import { sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import { getFulfillmentConfig, setFulfillmentConfig } from './fulfillment-config.service';
import * as orderService from './order.service';

// (prepaid-only redesign) — `POST /orders/checkout` (and its
// `checkoutHandler`) is deliberately REMOVED, not just left unused: it used
// to create an Order + deduct inventory immediately, before any payment.
// That is exactly the bug this redesign eliminates. Checkout now starts at
// `POST /payments/checkout-intent` (payments.routes.ts /
// payment.service.ts::createCheckoutIntent) — a Razorpay payment order is
// created for the validated amount, and an Order is only ever created once
// payment is verified captured (order.service.ts::finalizeOrderFromDraft).

/** Part 10 — a customer gets the enriched detail view (invoice/return/refund/replacement/shipment summary composed server-side); staff use the plain fetch (admin order-management screens compose their own richer views separately). */
export const getOrderHandler = asyncHandler(async (req: Request, res) => {
  const fetch =
    req.user!.role === 'customer' ? orderService.getOrderDetailForCustomer : orderService.getOrderById;
  return sendSuccess(res, await fetch(req.params.id, req.user!));
});

export const listMyOrdersHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await orderService.listMyOrders(req.user!.id, req.query as unknown as ListQuery),
  );
});

export const listOrdersHandler = asyncHandler(async (req, res) => {
  const result = await orderService.listOrders(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const updateOrderStatusHandler = asyncHandler(async (req: Request, res) => {
  const { status, note } = req.body as { status: OrderStatus; note?: string };
  return sendSuccess(
    res,
    await orderService.updateOrderStatus(req.params.id, status, req.user!.id, note),
  );
});

export const cancelOrderHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await orderService.cancelOrder(req.params.id, req.user!, req.body.reason),
  );
});

// Part 30/39/42 — Super Admin / permitted Platform Admin
// configuration surface for the automated post-payment fulfillment sweep,
// same pattern as prescription.routes.ts's `/config` pair (a validated,
// defaults-merged endpoint, not the raw generic Configuration one).
export const getFulfillmentConfigHandler = asyncHandler(async (_req: Request, res) => {
  return sendSuccess(res, await getFulfillmentConfig());
});

export const setFulfillmentConfigHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await setFulfillmentConfig(req.body, req.user!.id, req.user!.role),
  );
});
