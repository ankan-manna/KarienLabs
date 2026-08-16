import type { ReactNode } from 'react';

import { cn } from '../../utils/cn';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900',
        className,
      )}
    >
      {children}
    </div>
  );
}
