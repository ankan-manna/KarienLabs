import { googleLoginUrl } from '../../../api/auth.api';

interface GoogleSignInButtonProps {
  /** `admin` (default) only ever signs into an already-authorized staff account; `customer` auto-provisions a new account on first use. */
  flow?: 'admin' | 'customer';
  /** Which page to bounce back to if the flow fails — defaults to `login`. */
  origin?: 'login' | 'register';
  /** Defaults to "Continue with Google"; Register's button reads "Sign up with Google" instead. */
  label?: string;
}

/**
 * Plain `<a>` navigation, not a client-side router Link or an axios call —
 * "Continue with Google" is a full-page redirect into Google's OAuth consent
 * screen (see apps/api/.../auth.controller.ts's googleLoginHandler), so the
 * browser needs to actually leave the SPA.
 */
export function GoogleSignInButton({
  flow = 'admin',
  origin = 'login',
  label = 'Continue with Google',
}: GoogleSignInButtonProps) {
  return (
    <a
      href={googleLoginUrl(flow, origin)}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 dark:border-night-border dark:bg-night-surface dark:text-night-text dark:hover:bg-night-elevated"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18Z"
        />
        <path
          fill="#FBBC05"
          d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.29-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33Z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .9 4.97l3.05 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
        />
      </svg>
      {label}
    </a>
  );
}
