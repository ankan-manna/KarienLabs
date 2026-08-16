import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</h3>
      {description && (
        <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
