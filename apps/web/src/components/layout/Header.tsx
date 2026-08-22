import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../modules/storefront/hooks/useCart';
import { getProfilePath, isStaffRole } from '../../utils/account-path';
import { Avatar } from '../common/Avatar';

import { ThemeToggle } from './ThemeToggle';

const NAV_LINKS = [
  { to: '/products', label: 'Products' },
  { to: '/offers', label: 'Offers' },
  { to: '/blog', label: 'Blog' },
  { to: '/about', label: 'About' },
  // Part 1/2 — the existing Distributor/Bulk Purchase enquiry page
  // (BulkPurchasePage.tsx) was previously only reachable from the footer;
  // the business requires a clearly accessible header entry point too.
  // Reuses the exact same route, no new page.
  { to: '/bulk-purchase', label: 'Bulk Purchase' },
];

function SearchInput({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState('');

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const q = searchValue.trim();
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  return (
    <form onSubmit={handleSearchSubmit} className={compact ? 'w-full' : 'relative w-full max-w-xl'}>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-teal"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 1 0 3.61 9.65l3.62 3.62a.75.75 0 1 0 1.06-1.06l-3.62-3.62A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <input
          type="search"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Search medicines, health products & more"
          aria-label="Search medicines, health products & more"
          className="w-full rounded-full border-0 bg-white py-2.5 pl-9 pr-4 text-sm text-charcoal-teal placeholder:text-slate-teal focus:outline-none focus:ring-2 focus:ring-coral"
        />
      </div>
    </form>
  );
}

/**
 * Website Design Part 2 — [Logo] [Search] [nav links] [Account] [Cart], in
 * that exact order, with search immediately after the logo (previously the
 * logo/nav/icons sat on one row and search was a second row below — now
 * search is inline on desktop, matching the required order; it drops to its
 * own full-width row only below the `lg` breakpoint, where there also isn't
 * room for the nav links inline, so those move into the hamburger menu —
 * "search should remain easy to access" on mobile is still satisfied, it's
 * just not literally the same single DOM row a wide viewport has room for).
 * Deep teal is now the navbar's own background ("the primary brand/
 * navigation color", design system Part 1) — a colored-chrome bar rather
 * than a themed content surface, so it does NOT flip with light/dark mode
 * (its very dark base color already reads correctly against either theme).
 */
export function Header() {
  const { user, isAuthenticated } = useAuth();
  const { data: cart } = useCart();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  return (
    <header className="sticky top-0 z-30 bg-deep-teal">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => setMobileNavOpen((o) => !o)}
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileNavOpen}
          className="rounded-md p-1.5 text-white/90 hover:bg-white/10 lg:hidden"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5" aria-hidden="true">
            {mobileNavOpen ? (
              <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            ) : (
              <path
                fillRule="evenodd"
                d="M2 4.75A.75.75 0 0 1 2.75 4h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 10Zm0 5.25a.75.75 0 0 1 .75-.75h14.5a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1-.75-.75Z"
                clipRule="evenodd"
              />
            )}
          </svg>
        </button>

        <Link to="/" aria-label="KarienLabs" className="flex flex-shrink-0 items-center">
          <img src="/logo.jpg" alt="KarienLabs" className="h-9 w-auto rounded" />
        </Link>

        {/* Search: immediately after the logo, per the required header order. Inline on desktop; below lg it moves to its own full-width row (see bottom of header). */}
        <div className="hidden flex-1 lg:block">
          <SearchInput />
        </div>

        <nav className="ml-2 hidden items-center gap-5 text-sm font-medium text-white/85 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="whitespace-nowrap transition-colors hover:text-coral">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {isStaffRole(user?.role) && (
            <Link
              to="/admin/dashboard"
              className="hidden rounded-md bg-white/10 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-white/20 sm:block sm:px-3 sm:text-sm"
            >
              Control Panel
            </Link>
          )}
          <ThemeToggle className="hover:!bg-white/10" />
          <Link
            to="/cart"
            aria-label="Cart"
            className="relative rounded-md p-2 text-white/90 hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
              <path
                d="M3 3h2l.4 2M7 13h10l3-8H5.4M7 13L5.4 5M7 13l-1.7 5H17M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-coral px-1 text-[10px] font-semibold text-white">
                {itemCount}
              </span>
            )}
          </Link>
          {isAuthenticated ? (
            <Link to={getProfilePath(user?.role)} className="flex items-center gap-2 rounded-md p-1 hover:bg-white/10">
              <Avatar name={user?.name ?? '?'} size="sm" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-white hover:bg-white/10 sm:px-3"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>

      {/* Part 1/2 — "Prominent Search": below `lg`, there's no room for search
          inline with the logo/icons AND nav links, so it becomes its own
          full-width row here — still always visible, never hidden behind a
          menu, so it stays "easy to access" on mobile/tablet. */}
      <div className="px-4 pb-3 lg:hidden">
        <SearchInput compact />
      </div>

      {mobileNavOpen && (
        <nav className="border-t border-white/10 px-4 py-2 lg:hidden">
          <ul className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={() => setMobileNavOpen(false)}
                  className="block rounded-md px-2 py-2.5 text-sm font-medium text-white/90 hover:bg-white/10"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            {isStaffRole(user?.role) && (
              <li>
                <Link
                  to="/admin/dashboard"
                  onClick={() => setMobileNavOpen(false)}
                  className="block rounded-md px-2 py-2.5 text-sm font-medium text-coral hover:bg-white/10"
                >
                  Control Panel
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
