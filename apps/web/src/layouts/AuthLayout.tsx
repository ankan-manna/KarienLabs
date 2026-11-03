import { Link, Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-soft-mint px-4 dark:bg-night">
      <div className="w-full max-w-sm">
        {/* Same text wordmark as Header.tsx/Footer.tsx (see those files'
            comments for why — newLogo.jpeg isn't a header/lockup-ready
            asset). This layout is shared by customer login/register AND
            staff sign-in (Header.tsx's "Control Panel" link implies staff
            use this same /login) — one consistent, current brand mark for
            whoever's signing in, not a reason to leave the old KARIEN
            LABS logo showing here while the rest of the site is rebranded. */}
        <div className="mb-6 flex justify-center">
          <Link to="/" aria-label="BRENTIS HEALTHCARE — home" className="flex items-center gap-2">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6 flex-shrink-0 text-primary" aria-hidden="true">
              <path d="M10 17.3 8.6 16c-4-3.6-6.6-6-6.6-9A4 4 0 0 1 9.5 4.6l.5.6.5-.6A4 4 0 0 1 18.2 7c0 3-2.6 5.4-6.6 9l-1.4 1.3Z" />
            </svg>
            <span className="font-brentis-display text-xl font-semibold tracking-tight text-ink dark:text-night-text">
              BRENTIS <span className="text-primary">HEALTHCARE</span>
            </span>
          </Link>
        </div>
        <div className="rounded-lg border border-pale-sage bg-white p-6 shadow-sm dark:border-night-border dark:bg-night-surface">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
