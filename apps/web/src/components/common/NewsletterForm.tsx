import { useState } from 'react';

import { cn } from '../../utils/cn';
import { toast } from '../../utils/toast';

/**
 * Newsletter form has no backend endpoint yet (no NewsletterSubscriber model in
 * this build) — submission is client-only, shows a success toast, and is
 * disclosed here as a placeholder for a future `/newsletter/subscribe` route.
 * Shared between the footer (dark, on the deep-teal chrome) and the homepage
 * newsletter section (light, on a mint/white surface) — same behavior, just a
 * different input treatment for legibility against each background.
 */
export function NewsletterForm({
  variant = 'light',
  className,
}: {
  variant?: 'light' | 'dark';
  className?: string;
}) {
  const [email, setEmail] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    toast.success("Subscribed! We'll keep you posted on offers and new arrivals.");
    setEmail('');
  }

  return (
    <form onSubmit={handleSubmit} className={cn('flex gap-2', className)}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        className={cn(
          'w-full rounded-md border-0 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-coral',
          variant === 'dark'
            ? 'bg-white/10 text-white placeholder:text-white/50'
            : 'border border-pale-sage bg-white text-charcoal-teal placeholder:text-slate-teal dark:border-night-border dark:bg-night-elevated dark:text-night-text dark:placeholder:text-night-muted',
        )}
      />
      <button
        type="submit"
        className="whitespace-nowrap rounded-md bg-coral px-4 py-2 text-sm font-medium text-white hover:brightness-95"
      >
        Subscribe
      </button>
    </form>
  );
}
