import { Link, Outlet } from 'react-router-dom';

import { Avatar } from '../components/common/Avatar';
import { Footer } from '../components/layout/Footer';
import { ThemeToggle } from '../components/layout/ThemeToggle';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../modules/storefront/hooks/useCart';
import { useInventoryEvents } from '../modules/storefront/hooks/useInventoryEvents';
import { getProfilePath, isStaffRole } from '../utils/account-path';

export function PublicLayout() {
  const { user, isAuthenticated } = useAuth();
  const { data: cart } = useCart();
  useInventoryEvents();
  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 dark:bg-gray-950">
      <header className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="KarienLabs" className="flex items-center">
            <img src="/logo.jpg" alt="KarienLabs" className="h-9 w-auto rounded" />
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-gray-600 dark:text-gray-300 sm:flex">
            <Link to="/products" className="hover:text-brand-600">
              Products
            </Link>
            <Link to="/offers" className="hover:text-brand-600">
              Offers
            </Link>
            <Link to="/blog" className="hover:text-brand-600">
              Blog
            </Link>
            <Link to="/about" className="hover:text-brand-600">
              About
            </Link>
            {/* Part 1/2 — the existing Distributor/Bulk Purchase enquiry page
                (BulkPurchasePage.tsx) was previously only reachable from the
                footer; the business requires a clearly accessible header
                entry point too. Reuses the exact same route, no new page. */}
            <Link to="/bulk-purchase" className="hover:text-brand-600">
              Bulk Purchase
            </Link>
            <Link to="/search" className="hover:text-brand-600">
              Search
            </Link>
          </nav>

          <div className="flex items-center gap-3">
            {isStaffRole(user?.role) && (
              <Link
                to="/admin/dashboard"
                className="rounded-md bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:hover:bg-brand-500/20 sm:px-3 sm:text-sm"
              >
                Control Panel
              </Link>
            )}
            <ThemeToggle />
            <Link
              to="/cart"
              className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              🛒
              {itemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">
                  {itemCount}
                </span>
              )}
            </Link>
            {isAuthenticated ? (
              <Link to={getProfilePath(user?.role)} className="flex items-center gap-2">
                <Avatar name={user?.name ?? '?'} size="sm" />
              </Link>
            ) : (
              <Link to="/login" className="text-sm font-medium text-brand-600 hover:underline">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
