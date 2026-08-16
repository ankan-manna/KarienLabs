import { Button } from './Button';

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  return (
    <div className="flex items-center justify-between px-1 py-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Showing <span className="font-medium text-gray-700 dark:text-gray-300">{from}</span>–
        <span className="font-medium text-gray-700 dark:text-gray-300">{to}</span> of{' '}
        <span className="font-medium text-gray-700 dark:text-gray-300">{total}</span>
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <span className="flex items-center px-2 text-sm text-gray-500 dark:text-gray-400">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
