import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';
import type { ListQueryParams, PaginatedMeta } from './types';

export interface Review {
  _id: string;
  productId: string;
  userId: { _id: string; name: string } | string;
  rating: number;
  title: string;
  comment: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
}

export interface RecentReview {
  _id: string;
  rating: number;
  title: string;
  comment: string;
  createdAt: string;
  userId: { _id: string; name: string } | string;
  productId: { _id: string; name: string; slug: string } | string;
}

export interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<number, number>;
}

export interface ReviewInput {
  productId: string;
  rating: number;
  title?: string;
  comment: string;
}

export async function listProductReviews(
  productId: string,
  params: ListQueryParams = {},
): Promise<{ items: Review[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<Review[]>>(`/reviews/product/${productId}`, {
    params,
  });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function getProductRatingSummary(productId: string): Promise<RatingSummary> {
  const { data } = await httpClient.get<ApiResponse<RatingSummary>>(
    `/reviews/product/${productId}/summary`,
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function listMyReviews(
  params: ListQueryParams = {},
): Promise<{ items: Review[]; meta: PaginatedMeta }> {
  const { data } = await httpClient.get<ApiResponse<Review[]>>('/reviews/mine', { params });
  if (!data.success) throw new Error(data.error.message);
  return { items: data.data, meta: data.meta as unknown as PaginatedMeta };
}

export async function createReview(input: ReviewInput): Promise<Review> {
  const { data } = await httpClient.post<ApiResponse<Review>>('/reviews', input);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function updateReview(
  id: string,
  input: Partial<Pick<ReviewInput, 'rating' | 'title' | 'comment'>>,
): Promise<Review> {
  const { data } = await httpClient.patch<ApiResponse<Review>>(`/reviews/${id}`, input);
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}

export async function deleteReview(id: string): Promise<void> {
  const { data } = await httpClient.delete<ApiResponse<{ deleted: boolean }>>(`/reviews/${id}`);
  if (!data.success) throw new Error(data.error.message);
}

/** Public — homepage "Customer Reviews" testimonial strip. */
export async function listRecentTopReviews(): Promise<RecentReview[]> {
  const { data } = await httpClient.get<ApiResponse<RecentReview[]>>('/reviews/recent');
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
