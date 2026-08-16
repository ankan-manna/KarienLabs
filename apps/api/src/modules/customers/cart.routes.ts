import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
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

cartRouter.use(requireAuth);
cartRouter.get('/', getMyCartHandler);
cartRouter.get('/prescription-status', getCartPrescriptionStatusHandler);
cartRouter.post('/items', validate(addCartItemSchema), addCartItemHandler);
cartRouter.patch('/items/:productId', validate(updateCartItemSchema), updateCartItemHandler);
cartRouter.delete('/items/:productId', removeCartItemHandler);
cartRouter.delete('/', clearCartHandler);
cartRouter.post('/coupon', validate(applyCartCouponSchema), applyCartCouponHandler);
cartRouter.delete('/coupon', removeCartCouponHandler);
