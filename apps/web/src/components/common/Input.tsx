import { forwardRef, useState, type InputHTMLAttributes } from 'react';

import { cn } from '../../utils/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M1.5 10S4.5 4 10 4s8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.25" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path
        d="M2.5 2.5l15 15M8.3 8.42a2.25 2.25 0 0 0 3.18 3.2M6.2 6.2C3.78 7.6 2.3 10 1.5 10c0 0 3 6 8.5 6a7.9 7.9 0 0 0 3.8-.98M14.2 14.1C16.9 12.6 18.5 10 18.5 10S16 4.6 10.9 4.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, id, className, type, ...props }, ref) => {
    const inputId = id ?? props.name;
    const isPassword = type === 'password';
    // Keeping the rendered element's `type` as local UI state — the actual
    // value, ref, and react-hook-form registration (onChange/onBlur/name)
    // in `...props` are never touched, so toggling visibility can never
    // alter or lose what the user typed.
    const [visible, setVisible] = useState(false);
    const resolvedType = isPassword ? (visible ? 'text' : 'password') : type;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="mb-1 block text-sm font-medium text-gray-700 dark:text-night-muted"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={resolvedType}
            className={cn(
              'w-full rounded-md border px-3 py-2 text-sm shadow-sm transition-colors',
              'bg-white text-gray-900 placeholder:text-gray-400 dark:bg-night-surface dark:text-night-text',
              'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
              error ? 'border-red-400' : 'border-gray-300 dark:border-night-border',
              isPassword ? 'pr-10' : '',
              className,
            )}
            aria-invalid={!!error}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? 'Hide password' : 'Show password'}
              aria-pressed={visible}
              className="absolute right-0 top-0 flex h-full w-10 items-center justify-center text-gray-400 transition-colors hover:text-gray-600 dark:text-night-muted dark:hover:text-night-text"
            >
              {visible ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          )}
        </div>
        {error ? (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-night-muted">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
