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
            // `text-brand-500` has no effect on a native, unstyled checkbox
            // (this project has no @tailwindcss/forms plugin translating
            // text-color into the check itself) — it was rendering with the
            // browser/OS default blue accent regardless of theme.
            // `accent-color` is the standards-based way to theme a native
            // checkbox's checked state without a plugin.
            'h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-primary)] focus:ring-[var(--color-primary)]',
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
