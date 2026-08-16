import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { deleteReview, updateReview, listMyReviews, type Review } from '../../../api/reviews.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { EmptyState } from '../../../components/common/EmptyState';
import { Input } from '../../../components/common/Input';
import { RatingStars } from '../../../components/common/RatingStars';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { Textarea } from '../../../components/common/Textarea';
import { formatDate } from '../../../utils/format';
import { toast } from '../../../utils/toast';

function EditReviewForm({ review, onDone }: { review: Review; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(review.rating);
  const [title, setTitle] = useState(review.title);
  const [comment, setComment] = useState(review.comment);

  const updateMutation = useMutation({
    mutationFn: () => updateReview(review._id, { rating, title, comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', 'mine'] });
      toast.success('Review updated');
      onDone();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-3">
      <RatingStars value={rating} size="lg" onChange={setRating} />
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (optional)" />
      <Textarea value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex gap-2">
        <Button
          size="sm"
          isLoading={updateMutation.isPending}
          disabled={comment.trim().length < 3}
          onClick={() => updateMutation.mutate()}
        >
          Save changes
        </Button>
        <Button size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export default function MyReviewsPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['reviews', 'mine'],
    queryFn: () => listMyReviews({ limit: 50 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReview(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', 'mine'] });
      toast.success('Review deleted');
      setDeletingId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Reviews</h1>

      {isLoading ? (
        <SkeletonRows rows={3} columns={1} />
      ) : !reviews || reviews.items.length === 0 ? (
        <EmptyState
          title="No reviews yet"
          description="Reviews you write on product pages will show up here."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.items.map((review) =>
            editingId === review._id ? (
              <Card key={review._id} className="p-4">
                <EditReviewForm review={review} onDone={() => setEditingId(null)} />
              </Card>
            ) : (
              <Card key={review._id} className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <RatingStars value={review.rating} size="sm" />
                    {review.title && (
                      <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {review.title}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{review.comment}</p>
                    <p className="mt-1 text-xs text-gray-400">{formatDate(review.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditingId(review._id)}>
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => setDeletingId(review._id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </Card>
            ),
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!deletingId}
        title="Delete review"
        message="Delete this review? This can't be undone."
        confirmLabel="Delete"
        isDangerous
        isLoading={deleteMutation.isPending}
        onConfirm={() => deletingId && deleteMutation.mutate(deletingId)}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}
