import { sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as productSearchService from './product-search.service';
import * as searchService from './search.service';

export const globalSearchHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await searchService.globalSearch(String(req.query.q ?? '')));
});

export const autocompleteHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await searchService.autocomplete(String(req.query.q ?? '')));
});

/**
 * Part 1/2 — the main paginated, filtered, sorted product search
 * endpoint. `req.query` has ALREADY been Zod-validated + type-coerced by
 * `validate(productSearchQuerySchema, 'query')` in search.routes.ts
 * (`middlewares/validate.ts` replaces `req.query` with the parsed,
 * typed result) — this handler trusts that shape directly rather than
 * re-parsing raw strings, since after validation `priceMin`/`page`/`limit`
 * are already real `number`s and `inStockOnly`/`prescriptionRequired` are
 * already the literal `'true'|'false'` strings the schema constrains them to.
 */
interface ValidatedSearchQuery {
  q?: string;
  categoryId?: string;
  brandId?: string;
  manufacturerId?: string;
  priceMin?: number;
  priceMax?: number;
  inStockOnly?: 'true' | 'false';
  prescriptionRequired?: 'true' | 'false';
  tags?: string;
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'popularity';
  page?: number;
  limit?: number;
}

export const searchProductsHandler = asyncHandler(async (req, res) => {
  const q = req.query as unknown as ValidatedSearchQuery;
  const result = await productSearchService.searchProducts({
    q: q.q,
    categoryId: q.categoryId,
    brandId: q.brandId,
    manufacturerId: q.manufacturerId,
    priceMin: q.priceMin,
    priceMax: q.priceMax,
    inStockOnly: q.inStockOnly === 'true',
    prescriptionRequired:
      q.prescriptionRequired === 'true' ? true : q.prescriptionRequired === 'false' ? false : undefined,
    tags: q.tags ? q.tags.split(',').filter(Boolean) : undefined,
    sort: q.sort,
    page: q.page,
    limit: q.limit,
  });
  return sendPaginated(res, result.items, result.meta);
});
