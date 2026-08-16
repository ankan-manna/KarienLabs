import { useState } from 'react';

import { cn } from '../../utils/cn';

interface RatingStarsProps {
  value: number;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  /** When provided, stars become clickable and this fires with the selected 1-5 rating. */
  onChange?: (rating: number) => void;
  className?: string;
}

const SIZE_CLASS = { sm: 'text-sm', md: 'text-base', lg: 'text-2xl' };

export function RatingStars({ value, count, size = 'md', onChange, className }: RatingStarsProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const interactive = !!onChange;
  const displayValue = hovered ?? value;

  return (
    <div className={cn('inline-flex items-center gap-1', className)}>
      <div className={cn('flex', SIZE_CLASS[size])} onMouseLeave={() => setHovered(null)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            role={interactive ? 'button' : undefined}
            aria-label={interactive ? `Rate ${star} star${star > 1 ? 's' : ''}` : undefined}
            onMouseEnter={interactive ? () => setHovered(star) : undefined}
            onClick={interactive ? () => onChange!(star) : undefined}
            className={cn(
              interactive && 'cursor-pointer',
              star <= Math.round(displayValue) ? 'text-yellow-400' : 'text-gray-300 dark:text-gray-700',
            )}
          >
            ★
          </span>
        ))}
      </div>
      {count !== undefined && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {value.toFixed(1)} ({count})
        </span>
      )}
    </div>
  );
}
