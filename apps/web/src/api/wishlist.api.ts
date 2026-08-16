import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

export interface WishlistItem {
  productId: string;
  addedAt: string;
}

export interface Wishlist {
  _id: string;
  items: WishlistItem[];
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export async function fetchWishlist(): Promise<Wishlist> {
  const { data } = await httpClient.get<ApiResponse<Wishlist>>('/wishlist');
  return unwrap(data);
}

export async function addToWishlist(productId: string): Promise<Wishlist> {
  const { data } = await httpClient.post<ApiResponse<Wishlist>>('/wishlist', { productId });
  return unwrap(data);
}

export async function removeFromWishlist(productId: string): Promise<Wishlist> {
  const { data } = await httpClient.delete<ApiResponse<Wishlist>>(`/wishlist/${productId}`);
  return unwrap(data);
}
