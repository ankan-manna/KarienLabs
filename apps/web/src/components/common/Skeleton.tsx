import { cn } from '../../utils/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-gray-200 dark:bg-gray-800', className)} />;
}

export function SkeletonRows({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
