import type { Request } from 'express';

import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as wishlistService from './wishlist.service';

export const getMyWishlistHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await wishlistService.getMyWishlist(req.user!.id));
});

export const addToWishlistHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await wishlistService.addToWishlist(req.user!.id, req.body.productId));
});

export const removeFromWishlistHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await wishlistService.removeFromWishlist(req.user!.id, req.params.productId),
  );
});
