import { Router } from 'express';
import { z } from 'zod';

import { searchRateLimiter } from '../../middlewares/rate-limit.middleware';
import { validate } from '../../utils/validate';

import { autocompleteHandler, globalSearchHandler, searchProductsHandler } from './search.controller';

export const searchRouter = Router();

// Part 39 — public/unauthenticated endpoints, rate-limited per-IP against
// scraping/enumeration abuse.
searchRouter.use(searchRateLimiter);

const querySchema = z.object({ q: z.string().trim().min(1).max(200) });

// Part 39 — every accepted product-search param is an explicit, bounded,
// typed Zod field; there is no generic `filter[...]` passthrough bag here
// (unlike the older `/products?filter[x]=y` endpoint) — nothing a caller
// sends can become an arbitrary Mongo operator.
const productSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  categoryId: z.string().trim().max(64).optional(),
  brandId: z.string().trim().max(64).optional(),
  manufacturerId: z.string().trim().max(64).optional(),
  priceMin: z.coerce.number().min(0).optional(),
  priceMax: z.coerce.number().min(0).optional(),
  inStockOnly: z.enum(['true', 'false']).optional(),
  prescriptionRequired: z.enum(['true', 'false']).optional(),
  tags: z.string().trim().max(300).optional(),
  sort: z.enum(['relevance', 'price_asc', 'price_desc', 'newest', 'popularity']).optional(),
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

searchRouter.get('/products', validate(productSearchQuerySchema, 'query'), searchProductsHandler);
searchRouter.get('/', validate(querySchema, 'query'), globalSearchHandler);
searchRouter.get('/autocomplete', validate(querySchema, 'query'), autocompleteHandler);
