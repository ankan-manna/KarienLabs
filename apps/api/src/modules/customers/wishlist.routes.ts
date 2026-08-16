import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { objectIdSchema } from '../../utils/common-schemas';
import { validate } from '../../utils/validate';

import {
  addToWishlistHandler,
  getMyWishlistHandler,
  removeFromWishlistHandler,
} from './wishlist.controller';

export const wishlistRouter = Router();

wishlistRouter.use(requireAuth);
wishlistRouter.get('/', getMyWishlistHandler);
wishlistRouter.post('/', validate(z.object({ productId: objectIdSchema })), addToWishlistHandler);
wishlistRouter.delete('/:productId', removeFromWishlistHandler);
