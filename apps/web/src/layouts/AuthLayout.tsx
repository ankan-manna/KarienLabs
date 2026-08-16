import { Link, Outlet } from 'react-router-dom';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Link to="/" aria-label="KarienLabs">
            <img src="/logo.jpg" alt="KarienLabs" className="h-12 w-auto rounded" />
          </Link>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
