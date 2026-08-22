import { forwardRef, type TextareaHTMLAttributes } from 'react';

import { cn } from '../../utils/cn';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, id, className, ...props }, ref) => {
    const areaId = id ?? props.name;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={areaId}
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-night-muted"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={areaId}
          className={cn(
            'w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors',
            'bg-white text-gray-900 placeholder:text-gray-400 dark:bg-night-surface dark:text-night-text',
            'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
            error ? 'border-red-400' : 'border-gray-300 dark:border-night-border',
            className,
          )}
          aria-invalid={!!error}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
