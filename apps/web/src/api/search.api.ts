import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { PublicProduct } from './products-public.api';

export interface SearchResults {
  products: PublicProduct[];
  categories: { _id: string; name: string; slug: string }[];
  blogPosts: { _id: string; title: string; slug: string; excerpt: string }[];
}

export async function globalSearch(query: string): Promise<SearchResults> {
  const { data } = await httpClient.get<ApiResponse<SearchResults>>('/search', {
    params: { q: query },
  });
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
