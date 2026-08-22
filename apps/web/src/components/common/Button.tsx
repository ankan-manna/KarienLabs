import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '../../utils/cn';

import { Spinner } from './Spinner';

type Variant = 'primary' | 'gradient' | 'secondary' | 'danger' | 'ghost' | 'outline' | 'coral' | 'teal';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 focus-visible:ring-brand-500',
  // Brand gradient (#FF8000 → #FF4B33) — reserved for the small set of
  // MAJOR CTA buttons (Add to Cart, Buy Now, Checkout, Register, Distributor
  // Enquiry submit, ...), never the default for every button on the site.
  gradient:
    'bg-gradient-to-r from-brand-500 to-brand-gradient-end text-white hover:brightness-95 focus-visible:ring-brand-500',
  secondary:
    'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-night-elevated dark:text-night-text dark:hover:bg-night-elevated',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 dark:text-night-text dark:hover:bg-night-elevated',
  // Secondary action: brand-colored border/text on a plain background (Part
  // 5's spec) — used pervasively as "the" secondary/tertiary action across
  // admin (Cancel, Export, ...), so this stays a thin outline rather than a
  // filled color to preserve visual hierarchy against `primary`/`gradient`.
  outline:
    'border border-brand-500 text-brand-600 hover:bg-brand-50 dark:border-brand-500 dark:text-brand-400 dark:hover:bg-brand-500/10',
  // KarienLabs storefront design system — coral is the CTA accent
  // ("primarily used for important CTAs, highlights and selected
  // interactive states", spec Part 1). Admin never references this variant
  // string, so it has no effect on the Admin Control Panel's theme.
  coral: 'bg-coral text-white hover:brightness-95 focus-visible:ring-coral',
  teal: 'bg-deep-teal text-white hover:bg-healthcare-teal focus-visible:ring-healthcare-teal',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = 'primary', size = 'md', isLoading, disabled, className, children, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          // Subtle tap feedback (Part 31) — CSS-only, so it costs nothing and
          // applies everywhere Button is used; `motion-safe:` makes Tailwind
          // itself skip it under `prefers-reduced-motion: reduce`.
          'motion-safe:active:scale-[0.97] motion-safe:transition-transform',
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          className,
        )}
        {...props}
      >
        {isLoading && <Spinner size="sm" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
