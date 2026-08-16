import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '../../utils/cn';

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, id, className, ...props }, ref) => {
    const checkId = id ?? props.name;
    return (
      <label
        htmlFor={checkId}
        className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
      >
        <input
          ref={ref}
          type="checkbox"
          id={checkId}
          className={cn(
            'h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600',
            className,
          )}
          {...props}
        />
        {label}
      </label>
    );
  },
);
Checkbox.displayName = 'Checkbox';
