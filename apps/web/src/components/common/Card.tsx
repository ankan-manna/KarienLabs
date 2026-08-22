import type { ReactNode } from 'react';

import { cn } from '../../utils/cn';

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-gray-200 bg-white shadow-sm dark:border-night-border dark:bg-night-surface',
        className,
      )}
    >
      {children}
    </div>
  );
}
