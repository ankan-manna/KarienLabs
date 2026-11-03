import type { Request } from 'express';

import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as cartService from './cart.service';
import type { CartOwner } from './cart.service';

/** `optionalAuth` + `guestCartIdentity` guarantee exactly one of these is
 * present on every cart request — an authenticated user's own cart, or an
 * anonymous visitor's server-issued guest cart. Never falls back to reading
 * anything client-suppliable as the owner key. */
function resolveCartOwner(req: Request): CartOwner {
  if (req.user) return { userId: req.user.id };
  if (req.guestCartId) return { sessionId: req.guestCartId };
  throw new Error('Cart owner could not be resolved — guestCartIdentity middleware missing on this route');
}

export const getMyCartHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await cartService.getMyCart(resolveCartOwner(req)));
});

export const addCartItemHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await cartService.addCartItem(resolveCartOwner(req), req.body));
});

export const updateCartItemHandler = asyncHandler(async (req: Request, res) => {
  const variantId = (req.query.variantId as string) ?? null;
  return sendSuccess(
    res,
    await cartService.updateCartItemQuantity(
      resolveCartOwner(req),
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
    await cartService.removeCartItem(resolveCartOwner(req), req.params.productId, variantId),
  );
});

export const clearCartHandler = asyncHandler(async (req: Request, res) => {
  await cartService.clearCart(resolveCartOwner(req));
  return sendSuccess(res, { cleared: true });
});

export const applyCartCouponHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await cartService.applyCouponToCart(req.user!.id, req.body.code));
});

export const removeCartCouponHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await cartService.removeCouponFromCart(req.user!.id));
});

export const getCartPrescriptionStatusHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await cartService.getCartPrescriptionStatus(resolveCartOwner(req)));
});
