import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { autocompleteSuggestions } from '../../api/search.api';
import { useAuth } from '../../context/AuthContext';
import { useUnsavedChangesContext } from '../../context/UnsavedChangesContext';
import { useDebounce } from '../../hooks/useDebounce';
import { useCart } from '../../modules/storefront/hooks/useCart';
import { getProfilePath, isStaffRole } from '../../utils/account-path';
import { Avatar } from '../common/Avatar';

import { ThemeToggle } from './ThemeToggle';

const AUTOCOMPLETE_MIN_LENGTH = 2;
const AUTOCOMPLETE_DEBOUNCE_MS = 400;

// Cycling search placeholder — matches Brintoncare's rotating search hints.
// Module-level (not recreated per render) so the cycling effect's
// dependency array stays stable.
const SEARCH_PLACEHOLDERS = [
  'Search medicines, health products & more',
  'Search for Pain Relief',
  'Search for Vitamins & Supplements',
  'Search for Skin Care',
  'Search for Wellness Essentials',
];

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

/**
 * Live, debounced search-as-you-type with a professional (1mg-style)
 * suggestions dropdown — previously this only navigated to `/search` on
 * Enter/submit, with no feedback at all while typing. Debounces locally
 * (400ms, within the requested 300–500ms range) before querying
 * `/search/autocomplete` (cached, ranked backend endpoint — see
 * `search.service.ts`'s `autocomplete()` for the name > generic > SKU
 * ranking and brand/category/image enrichment). React Query keys the
 * query by the debounced text, so an older in-flight request can never
 * overwrite a newer one — its result is simply never applied because it's
 * stored under a stale key — and the in-flight request is also actually
 * cancelled via `AbortSignal` when the text changes again, per `useQuery`'s
 * built-in cancellation. Enter still submits to the full paginated results
 * page; it does not duplicate the autocomplete request, which continues
 * independently.
 *
 * Keyboard: ArrowDown/ArrowUp move a highlighted row (wrapping), Enter
 * either opens the highlighted product or (nothing highlighted) submits the
 * typed query, Escape closes the dropdown without clearing the input, Tab
 * behaves like normal browser focus navigation (no interception).
 */
function SearchInput({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounced = useDebounce(searchValue.trim(), AUTOCOMPLETE_DEBOUNCE_MS);
  const shouldSuggest = isOpen && debounced.length >= AUTOCOMPLETE_MIN_LENGTH;

  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const placeholderTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Only cycle when the input is empty (no user text)
    if (searchValue) return;
    placeholderTimerRef.current = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % SEARCH_PLACEHOLDERS.length);
    }, 3000);
    return () => {
      if (placeholderTimerRef.current) clearInterval(placeholderTimerRef.current);
    };
  }, [searchValue]);

  const {
    data: suggestions,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ['autocomplete', debounced],
    queryFn: ({ signal }) => autocompleteSuggestions(debounced, signal),
    enabled: shouldSuggest,
  });

  // Reset the highlighted row whenever the suggestion list itself changes
  // (new query, or the previous one just resolved) — an index highlighted
  // against the OLD list would otherwise point at the wrong row.
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [suggestions]);

  function goToResults(q: string) {
    setIsOpen(false);
    navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  }

  function goToProduct(slug: string) {
    setIsOpen(false);
    navigate(`/products/${slug}`);
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    if (highlightedIndex >= 0 && suggestions?.[highlightedIndex]) {
      goToProduct(suggestions[highlightedIndex].slug);
      return;
    }
    goToResults(searchValue.trim());
  }

  function handleClear() {
    setSearchValue('');
    setIsOpen(false);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setIsOpen(false);
      return;
    }
    if (!shouldSuggest || !suggestions || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    }
  }

  return (
    <form
      onSubmit={handleSearchSubmit}
      role="combobox"
      aria-expanded={shouldSuggest}
      aria-haspopup="listbox"
      className={compact ? 'relative w-full' : 'relative w-full max-w-xl'}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setIsOpen(false);
      }}
    >
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-night-muted"
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
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={SEARCH_PLACEHOLDERS[placeholderIdx]}
          aria-label="Search medicines, health products & more"
          aria-autocomplete="list"
          aria-activedescendant={highlightedIndex >= 0 ? `search-suggestion-${highlightedIndex}` : undefined}
          autoComplete="off"
          className="w-full rounded-full border border-pale-sage bg-white py-2.5 pl-9 pr-9 text-sm text-ink placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary dark:border-night-border dark:bg-night-surface dark:text-night-text dark:placeholder:text-night-muted [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        />
        {searchValue && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-night-muted dark:hover:bg-night-elevated dark:hover:text-night-text"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {shouldSuggest && (
        <div
          role="listbox"
          className="absolute inset-x-0 top-full z-40 mt-1 max-h-[70vh] overflow-y-auto rounded-lg border border-pale-sage bg-white shadow-lg dark:border-night-border dark:bg-night-surface"
        >
          {isFetching ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-gray-500 dark:text-night-muted">
              <span className="h-3.5 w-3.5 flex-shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Searching…
            </div>
          ) : isError ? (
            <p className="px-4 py-3 text-sm text-gray-500 dark:text-night-muted">
              Something went wrong. Please try again.
            </p>
          ) : suggestions && suggestions.length > 0 ? (
            <ul>
              {suggestions.map((s, index) => {
                const meta = [s.brandName, s.genericName, s.strength].filter(Boolean).join(' · ');
                return (
                  <li key={s._id} id={`search-suggestion-${index}`} role="option" aria-selected={index === highlightedIndex}>
                    <Link
                      to={`/products/${s.slug}`}
                      onClick={() => setIsOpen(false)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                        index === highlightedIndex
                          ? 'bg-deep-teal dark:bg-night-elevated'
                          : 'hover:bg-deep-teal dark:hover:bg-night-elevated'
                      }`}
                    >
                      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-deep-teal text-gray-400 dark:bg-night-elevated">
                        {s.image ? (
                          <img src={s.image} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                            <path d="M4 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm3 2v3h6V6H7Z" />
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-ink dark:text-night-text">{s.name}</span>
                        {meta && (
                          <span className="block truncate text-xs text-gray-500 dark:text-night-muted">{meta}</span>
                        )}
                      </span>
                      {s.categoryName && (
                        <span className="hidden flex-shrink-0 whitespace-nowrap text-xs text-gray-400 dark:text-night-muted sm:block">
                          {s.categoryName}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-4 py-3 text-sm text-gray-500 dark:text-night-muted">
              No matches for &quot;{debounced}&quot;
            </p>
          )}
          <button
            type="button"
            onClick={() => goToResults(searchValue.trim())}
            className="block w-full border-t border-pale-sage px-4 py-2.5 text-left text-sm font-medium text-primary hover:bg-deep-teal dark:border-night-border dark:hover:bg-night-elevated"
          >
            Search for &quot;{searchValue.trim()}&quot;
          </button>
        </div>
      )}
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
 * `ink` (dark) is the navbar's own background ("the primary brand/
 * navigation color") — a colored-chrome bar rather than a themed content
 * surface, so it does NOT flip with light/dark mode (its very dark base
 * color already reads correctly against either theme).
 */
export function Header() {
  const { user, isAuthenticated } = useAuth();
  const { data: cart } = useCart();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const itemCount = cart?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  const homeNavigate = useNavigate();
  const { guardRef, requestNavigation } = useUnsavedChangesContext();

  // A dirty form elsewhere on the page is the only case this ever does
  // anything — if nothing is registered as dirty, the click falls through
  // to the <Link>'s own instant navigation with zero added latency.
  const handleLogoClick = (e: MouseEvent) => {
    if (guardRef.current?.isDirty) {
      e.preventDefault();
      requestNavigation(() => homeNavigate('/'));
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-pale-sage bg-white dark:border-night-border dark:bg-night-surface">
      <div className="mx-auto flex max-w-[1920px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <button
          type="button"
          onClick={() => setMobileNavOpen((o) => !o)}
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileNavOpen}
          className="rounded-md p-1.5 text-ink hover:bg-deep-teal dark:text-night-text dark:hover:bg-night-elevated lg:hidden"
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

        <Link
          to="/"
          onClick={handleLogoClick}
          aria-label="BRENTIS HEALTHCARE — home"
          className="flex flex-shrink-0 items-center gap-2"
        >
          {/* Real brand mark (newLogo.jpeg) — pre-cropped server-side to a
              clean square (logo-mark.png) so it sits in the header at icon
              scale without the source hero graphic's wide aspect ratio
              distorting. */}
          <img
            src="/logo-mark.png"
            alt=""
            className="h-9 w-9 flex-shrink-0 rounded-xl object-cover"
          />
          {/* "BRENTIS HEALTHCARE" set in full doesn't fit next to the hamburger
              + search/cart/account icon cluster below ~400px (verified via
              browser QA — it pushed "Sign in" off-screen, causing real
              horizontal overflow) — "HEALTHCARE" drops below `sm` (640px) so
              the header never overflows on small phones. */}
          <span className="font-brentis-display text-lg font-semibold tracking-tight text-ink dark:text-night-text sm:text-xl">
            BRENTIS<span className="hidden text-primary sm:inline"> HEALTHCARE</span>
          </span>
        </Link>

        {/* Search: immediately after the logo, per the required header order. Inline on desktop; below lg it moves to its own full-width row (see bottom of header). */}
        <div className="hidden flex-1 lg:block">
          <SearchInput />
        </div>

        <nav className="ml-2 hidden items-center gap-5 text-sm font-medium text-ink/80 dark:text-night-muted lg:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className="whitespace-nowrap transition-colors hover:text-accent">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {isStaffRole(user?.role) && (
            <Link
              to="/admin/dashboard"
              className="hidden rounded-md bg-deep-teal px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-pale-sage dark:bg-night-elevated dark:text-night-text dark:hover:bg-night-border sm:block sm:px-3 sm:text-sm"
            >
              Control Panel
            </Link>
          )}
          <ThemeToggle />
          <Link
            to="/cart"
            aria-label="Cart"
            className="relative rounded-md p-2 text-ink hover:bg-deep-teal dark:text-night-text dark:hover:bg-night-elevated"
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
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-white">
                {itemCount}
              </span>
            )}
          </Link>
          {isAuthenticated ? (
            <Link
              to={getProfilePath(user?.role)}
              className="flex items-center gap-2 rounded-md p-1 hover:bg-deep-teal dark:hover:bg-night-elevated"
            >
              <Avatar name={user?.name ?? '?'} size="sm" />
            </Link>
          ) : (
            <Link
              to="/login"
              className="rounded-md px-2.5 py-1.5 text-sm font-medium text-ink hover:bg-deep-teal dark:text-night-text dark:hover:bg-night-elevated sm:px-3"
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
        <nav className="border-t border-pale-sage px-4 py-2 dark:border-night-border lg:hidden">
          <ul className="flex flex-col">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={() => setMobileNavOpen(false)}
                  className="block rounded-md px-2 py-2.5 text-sm font-medium text-ink hover:bg-deep-teal dark:text-night-text dark:hover:bg-night-elevated"
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
                  className="block rounded-md px-2 py-2.5 text-sm font-medium text-accent hover:bg-deep-teal dark:hover:bg-night-elevated"
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
