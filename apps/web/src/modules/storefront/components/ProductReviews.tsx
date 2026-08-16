import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { createReview, getProductRatingSummary, listProductReviews } from '../../../api/reviews.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { RatingStars } from '../../../components/common/RatingStars';
import { Skeleton } from '../../../components/common/Skeleton';
import { Textarea } from '../../../components/common/Textarea';
import { useAuth } from '../../../context/AuthContext';
import { formatDate } from '../../../utils/format';
import { toast } from '../../../utils/toast';

const reviewFormSchema = z.object({
  rating: z.number().int().min(1, 'Select a rating').max(5),
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().min(3, 'Tell us a bit more').max(2000),
});
type ReviewFormValues = z.infer<typeof reviewFormSchema>;

function RatingBar({ star, count, total }: { star: number; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <span className="w-8">{star}★</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        <div className="h-full bg-yellow-400" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right">{count}</span>
    </div>
  );
}

export function ProductReviews({ productId }: { productId: string }) {
  const { isAuthenticated } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ['reviews', 'summary', productId],
    queryFn: () => getProductRatingSummary(productId),
  });
  const { data: reviews, isLoading } = useQuery({
    queryKey: ['reviews', 'product', productId],
    queryFn: () => listProductReviews(productId, { limit: 20 }),
  });

  const createMutation = useMutation({
    mutationFn: (values: ReviewFormValues) => createReview({ productId, ...values }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', 'product', productId] });
      queryClient.invalidateQueries({ queryKey: ['reviews', 'summary', productId] });
      toast.success('Thanks for your review!');
      setShowForm(false);
      reset({ rating: 0, title: '', comment: '' });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ReviewFormValues>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: { rating: 0, title: '', comment: '' },
  });
  const rating = watch('rating');

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Reviews & Ratings
        </h2>
        {isAuthenticated && (
          <Button variant="outline" size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Write a review'}
          </Button>
        )}
      </div>

      {summary && summary.count > 0 && (
        <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-1 sm:border-r sm:border-gray-100 sm:pr-4 sm:dark:border-gray-800">
            <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {summary.average.toFixed(1)}
            </span>
            <RatingStars value={summary.average} />
            <span className="text-xs text-gray-500">{summary.count} reviews</span>
          </div>
          <div className="flex-1 space-y-1">
            {[5, 4, 3, 2, 1].map((star) => (
              <RatingBar
                key={star}
                star={star}
                count={summary.distribution[star] ?? 0}
                total={summary.count}
              />
            ))}
          </div>
        </Card>
      )}

      {showForm && (
        <Card className="p-4">
          <form onSubmit={handleSubmit((v) => createMutation.mutate(v))} className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-sm font-medium text-gray-700 dark:text-gray-200">Your rating</p>
              <RatingStars value={rating} size="lg" onChange={(r) => setValue('rating', r)} />
              {errors.rating && <p className="mt-1 text-xs text-red-500">{errors.rating.message}</p>}
            </div>
            <input type="text" placeholder="Title (optional)" {...register('title')} className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" />
            <Textarea placeholder="Share your experience with this product…" error={errors.comment?.message} {...register('comment')} />
            <Button type="submit" isLoading={isSubmitting} className="self-start">
              Submit review
            </Button>
          </form>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : reviews && reviews.items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-gray-100 dark:divide-gray-800">
          {reviews.items.map((review) => (
            <li key={review._id} className="py-3">
              <div className="flex items-center gap-2">
                <RatingStars value={review.rating} size="sm" />
                {review.isVerifiedPurchase && (
                  <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    Verified purchase
                  </span>
                )}
                <span className="text-xs text-gray-400">{formatDate(review.createdAt)}</span>
              </div>
              {review.title && (
                <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {review.title}
                </p>
              )}
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{review.comment}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No reviews yet. Be the first to review this product.</p>
      )}
    </section>
  );
}
