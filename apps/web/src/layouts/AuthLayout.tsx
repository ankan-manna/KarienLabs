import { Link, Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-soft-mint px-4 dark:bg-night">
      <div className="w-full max-w-sm">
        {/* Same real brand mark as Header.tsx/Footer.tsx. This layout is
            shared by customer login/register AND staff sign-in — one
            consistent, current brand mark for whoever's signing in. */}
        <div className="mb-6 flex justify-center">
          <Link to="/" aria-label="BRENTIS HEALTHCARE — home" className="flex items-center gap-2">
            <img src="/logo-mark.png" alt="" className="h-10 w-10 flex-shrink-0 rounded-xl object-cover" />
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
