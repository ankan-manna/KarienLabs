import type { Request } from 'express';

import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as cartService from './cart.service';

export const getMyCartHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await cartService.getMyCart(req.user!.id));
});

export const addCartItemHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await cartService.addCartItem(req.user!.id, req.body));
});

export const updateCartItemHandler = asyncHandler(async (req: Request, res) => {
  const variantId = (req.query.variantId as string) ?? null;
  return sendSuccess(
    res,
    await cartService.updateCartItemQuantity(
      req.user!.id,
      req.params.productId,
      variantId,
      req.body.quantity,
    ),
  );
});

export const removeCartItemHandler = asyncHandler(async (req: Request, res) => {
  const variantId = (req.query.variantId as string) ?? null;
  return sendSuccess(
    res,
    await cartService.removeCartItem(req.user!.id, req.params.productId, variantId),
  );
});

export const clearCartHandler = asyncHandler(async (req: Request, res) => {
  await cartService.clearCart(req.user!.id);
  return sendSuccess(res, { cleared: true });
});

export const applyCartCouponHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await cartService.applyCouponToCart(req.user!.id, req.body.code));
});

export const removeCartCouponHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await cartService.removeCouponFromCart(req.user!.id));
});

export const getCartPrescriptionStatusHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await cartService.getCartPrescriptionStatus(req.user!.id));
});
