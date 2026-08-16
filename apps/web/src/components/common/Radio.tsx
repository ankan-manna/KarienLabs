import { forwardRef, type InputHTMLAttributes } from 'react';

import { cn } from '../../utils/cn';

interface RadioProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ label, id, className, ...props }, ref) => {
    const radioId = id ?? `${props.name}-${props.value}`;
    return (
      <label
        htmlFor={radioId}
        className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
      >
        <input
          ref={ref}
          type="radio"
          id={radioId}
          className={cn(
            'h-4 w-4 border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-600',
            className,
          )}
          {...props}
        />
        {label}
      </label>
    );
  },
);
Radio.displayName = 'Radio';
