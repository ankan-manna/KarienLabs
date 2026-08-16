import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

export interface CartItem {
  productId: string;
  variantId: string | null;
  quantity: number;
  priceAtAdd: number;
  _id: string;
}

export interface Cart {
  _id: string;
  items: CartItem[];
  couponCode: string | null;
}

function unwrap<T>(response: ApiResponse<T>): T {
  if (!response.success) throw new Error(response.error.message);
  return response.data;
}

export async function fetchCart(): Promise<Cart> {
  const { data } = await httpClient.get<ApiResponse<Cart>>('/cart');
  return unwrap(data);
}

export async function addCartItem(productId: string, quantity: number, variantId?: string | null) {
  const { data } = await httpClient.post<ApiResponse<Cart>>('/cart/items', {
    productId,
    quantity,
    variantId,
  });
  return unwrap(data);
}

export async function updateCartItem(
  productId: string,
  quantity: number,
  variantId?: string | null,
) {
  const { data } = await httpClient.patch<ApiResponse<Cart>>(
    `/cart/items/${productId}${variantId ? `?variantId=${variantId}` : ''}`,
    { quantity },
  );
  return unwrap(data);
}

export async function removeCartItem(productId: string, variantId?: string | null) {
  const { data } = await httpClient.delete<ApiResponse<Cart>>(
    `/cart/items/${productId}${variantId ? `?variantId=${variantId}` : ''}`,
  );
  return unwrap(data);
}

export async function clearCart(): Promise<void> {
  await httpClient.delete('/cart');
}

export interface ApplyCouponResult {
  cart: Cart;
  discountAmount: number;
  allocation: { productId: string; amount: number }[];
}

/** Part 21 — returns the real, server-computed discount preview alongside the cart, never a frontend-estimated number. */
export async function applyCartCoupon(code: string): Promise<ApplyCouponResult> {
  const { data } = await httpClient.post<ApiResponse<ApplyCouponResult>>('/cart/coupon', { code });
  return unwrap(data);
}

/** Part 21/51 — the previously-missing counterpart to applyCartCoupon. */
export async function removeCartCoupon(): Promise<Cart> {
  const { data } = await httpClient.delete<ApiResponse<Cart>>('/cart/coupon');
  return unwrap(data);
}
