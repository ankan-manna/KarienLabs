import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { getProfilePath, isStaffRole } from '../../utils/account-path';
import { roleLabel } from '../../utils/role-label';
import { Avatar } from '../common/Avatar';

import { Breadcrumb } from './Breadcrumb';
import { ThemeToggle } from './ThemeToggle';

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav?: () => void }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const profilePath = getProfilePath(user?.role);
  const isStaff = isStaffRole(user?.role);

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 dark:border-night-border dark:bg-night-surface sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        {onOpenMobileNav && (
          <button
            onClick={onOpenMobileNav}
            aria-label="Open navigation"
            className="rounded p-1.5 text-gray-500 hover:bg-gray-100 dark:text-night-muted dark:hover:bg-night-elevated lg:hidden"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
              <path
                fillRule="evenodd"
                d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
        <Breadcrumb />
      </div>

      <div className="flex items-center gap-3">
        <ThemeToggle />

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-100 dark:hover:bg-night-elevated"
          >
            <Avatar name={user?.name ?? '?'} size="sm" />
            <span className="hidden text-sm text-gray-700 dark:text-night-text sm:inline">
              {user?.name}
            </span>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-night-border dark:bg-night-surface">
                <div className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500 dark:border-night-border">
                  {user?.email} · <span>{roleLabel(user?.role)}</span>
                </div>
                {!isStaff && (
                  <Link
                    to="/"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-night-text dark:hover:bg-night-elevated"
                  >
                    Home
                  </Link>
                )}
                {isStaff && (
                  <Link
                    to="/admin/dashboard"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-night-text dark:hover:bg-night-elevated"
                  >
                    Control Panel
                  </Link>
                )}
                <Link
                  to={profilePath}
                  onClick={() => setMenuOpen(false)}
                  className="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:text-night-text dark:hover:bg-night-elevated"
                >
                  Profile
                </Link>
                <button
                  onClick={() => logout()}
                  className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
