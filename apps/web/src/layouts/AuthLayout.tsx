import { Link, Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-soft-mint px-4 dark:bg-night">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Link to="/" aria-label="KarienLabs">
            <img src="/logo.jpg" alt="KarienLabs" className="h-12 w-auto rounded" />
          </Link>
        </div>
        <div className="rounded-lg border border-pale-sage bg-white p-6 shadow-sm dark:border-night-border dark:bg-night-surface">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
