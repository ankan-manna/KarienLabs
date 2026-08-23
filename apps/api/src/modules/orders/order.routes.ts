import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  cancelOrderHandler,
  getFulfillmentConfigHandler,
  getOrderHandler,
  listMyOrdersHandler,
  listOrdersHandler,
  setFulfillmentConfigHandler,
  updateOrderStatusHandler,
} from './order.controller';
import { cancelOrderSchema, setFulfillmentConfigSchema, updateOrderStatusSchema } from './order.validator';

export const orderRouter = Router();

orderRouter.use(requireAuth);

// `POST /orders/checkout` removed; see order.controller.ts's
// comment. Checkout now starts at `POST /payments/checkout-intent`.
orderRouter.get('/me', validate(listQuerySchema, 'query'), listMyOrdersHandler);

// Part 30/31/39/42 — MUST be registered before the `/:id` catch-all
// below (Express matches route patterns in registration order — the same
// reason `/me` above precedes it), same rationale/precedent as
// prescription.routes.ts's dedicated `/config` pair. Super Admin / permitted
// Platform Admin configuration surface for the automated fulfillment sweep;
// reuses the SAME `orders:update` permission that already gates the manual
// `PATCH /:id/status` transition below — "who may change how an order
// advances through fulfillment" is one coherent permission, whether the
// change is a single manual click or a platform-wide automation setting.
orderRouter.get(
  '/fulfillment-config',
  authorize(permission(RESOURCES.ORDERS, ACTIONS.UPDATE)),
  getFulfillmentConfigHandler,
);
orderRouter.put(
  '/fulfillment-config',
  authorize(permission(RESOURCES.ORDERS, ACTIONS.UPDATE)),
  validate(setFulfillmentConfigSchema),
  setFulfillmentConfigHandler,
);

orderRouter.get('/:id', getOrderHandler);
orderRouter.post('/:id/cancel', validate(cancelOrderSchema), cancelOrderHandler);

orderRouter.get(
  '/',
  authorize(permission(RESOURCES.ORDERS, ACTIONS.READ)),
  validate(listQuerySchema, 'query'),
  listOrdersHandler,
);
orderRouter.patch(
  '/:id/status',
  authorize(permission(RESOURCES.ORDERS, ACTIONS.UPDATE)),
  validate(updateOrderStatusSchema),
  updateOrderStatusHandler,
);
