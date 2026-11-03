import { Router } from 'express';

import { optionalAuth, requireAuth } from '../../middlewares/auth.middleware';
import { guestCartIdentity } from '../../middlewares/guest-cart.middleware';
import { validate } from '../../utils/validate';

import {
  addCartItemHandler,
  applyCartCouponHandler,
  clearCartHandler,
  getCartPrescriptionStatusHandler,
  getMyCartHandler,
  removeCartCouponHandler,
  removeCartItemHandler,
  updateCartItemHandler,
} from './cart.controller';
import { addCartItemSchema, applyCartCouponSchema, updateCartItemSchema } from './cart.validator';

export const cartRouter = Router();

// Cart browsing/editing is guest-friendly: optionalAuth resolves `req.user`
// when a token is present, and guestCartIdentity assigns an anonymous
// visitor a random, httpOnly cart id when it isn't. Coupons stay
// `requireAuth`-only below — coupon validation is inherently account-bound
// (per-user usage counters, "qualifying prior order" checks), so there is
// no guest-cart equivalent to extend.
cartRouter.use(optionalAuth);
cartRouter.use(guestCartIdentity);
cartRouter.get('/', getMyCartHandler);
cartRouter.get('/prescription-status', getCartPrescriptionStatusHandler);
cartRouter.post('/items', validate(addCartItemSchema), addCartItemHandler);
cartRouter.patch('/items/:productId', validate(updateCartItemSchema), updateCartItemHandler);
cartRouter.delete('/items/:productId', removeCartItemHandler);
cartRouter.delete('/', clearCartHandler);
cartRouter.post('/coupon', requireAuth, validate(applyCartCouponSchema), applyCartCouponHandler);
cartRouter.delete('/coupon', requireAuth, removeCartCouponHandler);
