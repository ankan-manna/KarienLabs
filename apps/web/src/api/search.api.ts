import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { PublicProduct } from './products-public.api';
import type { PaginatedMeta } from './types';

export interface SearchResults {
  products: PublicProduct[];
  categories: { _id: string; name: string; slug: string }[];
  blogPosts: { _id: string; title: string; slug: string; excerpt: string }[];
  didYouMean: string[];
}

/** Small, capped ("did you mean") cross-collection surface — NOT the paginated results page. See `searchProducts` for that. */
export async function globalSearch(query: string, signal?: AbortSignal): Promise<SearchResults> {
  const { data } = await httpClient.get<ApiResponse<SearchResults>>('/search', {
    params: { q: query },
    signal,
  });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export interface AutocompleteSuggestion {
  _id: string;
  name: string;
  slug: string;
  image: string | null;
  brandName: string | null;
  genericName: string | null;
  strength: string | null;
  categoryName: string | null;
}

/** Lightweight typeahead — prefix-matched, cached server-side. Used for the navbar's live suggestion dropdown while typing. */
export async function autocompleteSuggestions(
  query: string,
  signal?: AbortSignal,
): Promise<AutocompleteSuggestion[]> {
  const { data } = await httpClient.get<ApiResponse<AutocompleteSuggestion[]>>('/search/autocomplete', {
    params: { q: query },
    signal,
  });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export interface ProductSearchParams {
  q?: string;
  categoryId?: string;
  brandId?: string;
  manufacturerId?: string;
  priceMin?: number;
  priceMax?: number;
  inStockOnly?: boolean;
  prescriptionRequired?: boolean;
  tags?: string[];
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'popularity';
  page?: number;
  limit?: number;
}

/** The actual paginated, filtered, sorted product search — what the `/search` RESULTS PAGE should use (not `globalSearch`, which is capped at 10 with no pagination). */
export async function searchProducts(
  params: ProductSearchParams,
  signal?: AbortSignal,
): Promise<{ items: PublicProduct[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<PublicProduct[]>>('/search/products', {
    params: {
      ...params,
      inStockOnly: params.inStockOnly === undefined ? undefined : String(params.inStockOnly),
      prescriptionRequired:
        params.prescriptionRequired === undefined ? undefined : String(params.prescriptionRequired),
      tags: params.tags?.join(','),
    },
    signal,
  });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}
