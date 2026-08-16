import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';

import type { MenuItem } from '../../constants/menu';
import { useIsDesktop } from '../../hooks/useIsDesktop';
import { useVisibleMenu } from '../../hooks/useVisibleMenu';
import { cn } from '../../utils/cn';

interface SidebarProps {
  title: string;
  sections: { label?: string; items: MenuItem[] }[];
  /**
   * Prompt 33 Part 13/44 — off-canvas drawer state on mobile/tablet (no
   * hover there). Strictly OPT-IN: only supplied by AdminLayout.tsx. A
   * second consumer of this shared component, CustomerLayout.tsx, does not
   * pass these — passing neither is how this component detects that and
   * falls back to its exact pre-existing behavior (always the full flex-
   * column sidebar, no responsive hiding) so that unrelated, un-migrated
   * caller is never regressed by this prompt's admin-only navigation work.
   */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  /** Wraps the header logo in a link to this path — opt-in so AdminLayout's logo (out of scope here) stays exactly as it was. */
  logoHref?: string;
}

/**
 * Prompt 33 — categorized navigation shell. Each `section` (already the
 * project's existing grouping decision — see layouts/AdminLayout.tsx, one
 * `label` per RBAC-documented module group) renders as ONE of:
 *   - a flat single link, when it has no label (Dashboard) or collapses to
 *     exactly one visible item after permission filtering (Part 21 — never
 *     a pointless one-item dropdown)
 *   - a hover/click/keyboard category with a submenu (NavCategory below)
 * Desktop: hover or click opens a flyout; mobile/tablet: tap expands an
 * inline accordion (Part 13). No new navigation/routing system — every
 * link is a real `NavLink` to the SAME route it always was.
 */
export function Sidebar({ title, sections, mobileOpen = false, onCloseMobile, logoHref }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const rawIsDesktop = useIsDesktop();
  const hasMobileDrawer = onCloseMobile !== undefined;
  // Only a caller that opted into the mobile drawer (AdminLayout) ever sees
  // `treatAsDesktop === false` — CustomerLayout's un-migrated sidebar always
  // takes this branch and is therefore laid out exactly as before.
  const treatAsDesktop = rawIsDesktop || !hasMobileDrawer;

  // A resize past the desktop breakpoint (e.g. rotating a tablet) should not
  // leave a mobile-only backdrop+drawer stuck open with nothing left to close it.
  useEffect(() => {
    if (treatAsDesktop) onCloseMobile?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [treatAsDesktop]);

  // Same body-scroll-lock pattern already used by Drawer.tsx/Modal.tsx —
  // without it, a wheel/touch scroll over the open mobile drawer scrolls the
  // page underneath instead of the drawer's own (possibly taller-than-
  // viewport) nav list, since nothing stops the gesture from reaching body.
  const mobileDrawerActuallyOpen = !treatAsDesktop && mobileOpen;
  useEffect(() => {
    if (!mobileDrawerActuallyOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileDrawerActuallyOpen]);

  return (
    <>
      {!treatAsDesktop && mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40" onClick={onCloseMobile} aria-hidden="true" />
      )}
      <aside
        className={cn(
          'flex flex-col border-r border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900',
          treatAsDesktop
            ? cn('h-screen transition-all', collapsed ? 'w-16' : 'w-64')
            : cn(
                'fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 ease-in-out',
                mobileOpen ? 'translate-x-0' : '-translate-x-full',
              ),
        )}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 dark:border-gray-800">
          {(() => {
            const logo =
              collapsed && treatAsDesktop ? (
                <img src="/logo.jpg" alt="KarienLabs" className="h-6 w-6 rounded object-cover" />
              ) : (
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  <img src="/logo.jpg" alt="" className="h-6 w-auto rounded" />
                  {title}
                </span>
              );
            return logoHref ? (
              <Link to={logoHref} aria-label="KarienLabs Home" onClick={onCloseMobile}>
                {logo}
              </Link>
            ) : (
              logo
            );
          })()}
          {treatAsDesktop ? (
            <button
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {collapsed ? '»' : '«'}
            </button>
          ) : (
            <button
              onClick={onCloseMobile}
              aria-label="Close navigation"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              ✕
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {sections.map((section, i) => (
            <NavSection
              key={i}
              label={section.label}
              items={section.items}
              collapsed={collapsed && treatAsDesktop}
              isDesktop={treatAsDesktop}
              onNavigate={onCloseMobile}
            />
          ))}
        </nav>
      </aside>
    </>
  );
}

/** Prefix-with-boundary match — `/admin/orders/123` is active for `/admin/orders`, but `/admin/orders-archive` is not. Same semantics React Router's own `NavLink` uses for non-`end` matching, applied here to determine which CATEGORY contains the active route (Part 9/10). */
function isItemActive(pathname: string, item: MenuItem): boolean {
  return pathname === item.path || pathname.startsWith(`${item.path}/`);
}

function NavSection({
  label,
  items,
  collapsed,
  isDesktop,
  onNavigate,
}: {
  label?: string;
  items: MenuItem[];
  collapsed: boolean;
  isDesktop: boolean;
  onNavigate?: () => void;
}) {
  const visibleItems = useVisibleMenu(items);
  // Part 20 — a category with zero visible children (every item filtered
  // out by permission/feature-flag) never renders, not even its label.
  if (visibleItems.length === 0) return null;

  // Part 21 — no label (Dashboard) or exactly one visible child after
  // filtering: a flat direct link, never a one-item dropdown.
  if (!label || visibleItems.length === 1) {
    return (
      <div className="mb-1 space-y-0.5">
        {visibleItems.map((item) => (
          <NavItemLink key={item.key} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
      </div>
    );
  }

  return (
    <NavCategory
      label={label}
      items={visibleItems}
      collapsed={collapsed}
      isDesktop={isDesktop}
      onNavigate={onNavigate}
    />
  );
}

function NavItemLink({
  item,
  collapsed,
  onNavigate,
}: {
  item: MenuItem;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <NavLink
      to={item.path}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
        )
      }
    >
      {collapsed ? item.label.slice(0, 1) : item.label}
    </NavLink>
  );
}

const CHEVRON_PATH =
  'M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z';

let idSeq = 0;

/**
 * A single category: label + submenu of real routes.
 *  - Desktop: opens on hover OR click OR keyboard focus; a short close-delay
 *    (Part 27) absorbs the cursor crossing the gap between the trigger and
 *    the flyout panel. The flyout itself is `position: fixed` (computed
 *    from the trigger's own bounding rect), which — since neither this
 *    component nor any of its ancestors sets a CSS `transform` on desktop —
 *    escapes the sidebar `<nav>`'s `overflow-y-auto` clipping without
 *    needing a portal (Part 14), and because it stays a normal DOM child
 *    right after the trigger button, natural Tab order is preserved
 *    (Part 26) — a portal would have detached it to the end of `<body>`.
 *  - Mobile/tablet: tap toggles an inline accordion instead (no hover).
 */
function NavCategory({
  label,
  items,
  collapsed,
  isDesktop,
  onNavigate,
}: {
  label: string;
  items: MenuItem[];
  collapsed: boolean;
  isDesktop: boolean;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const isActiveCategory = items.some((item) => isItemActive(pathname, item));

  const [isOpen, setIsOpen] = useState(false);
  const [flyoutPos, setFlyoutPos] = useState<{ top: number; left: number; maxHeight: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const activeItemRef = useRef<HTMLAnchorElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuId] = useState(() => `nav-category-${++idSeq}`);

  const clearCloseTimer = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  // Viewport-edge margin — keeps the flyout from touching the browser
  // chrome, matching the existing "+4" gap already used for the left offset.
  const VIEWPORT_MARGIN = 8;

  const openNow = () => {
    clearCloseTimer();
    if (isDesktop && triggerRef.current) {
      // Part 3/4 — never a hardcoded pixel height. Pick whichever side of
      // the trigger (above vs below) has more room in the CURRENT viewport
      // and use ALL of that room as the flyout's max-height; a short
      // submenu just renders at its natural height within that budget, a
      // tall one scrolls (Part 3's overflow-y). When there's genuinely more
      // room above (trigger sits low in the viewport — Part 4's "opens near
      // the bottom" case), anchor the flyout's bottom to the trigger's
      // bottom instead of its top, i.e. open upward, rather than letting it
      // run off the bottom edge.
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.top - VIEWPORT_MARGIN;
      const spaceAbove = rect.bottom - VIEWPORT_MARGIN;

      if (spaceBelow >= spaceAbove) {
        setFlyoutPos({ top: rect.top, left: rect.right + 4, maxHeight: spaceBelow });
      } else {
        const maxHeight = spaceAbove;
        setFlyoutPos({
          top: Math.max(VIEWPORT_MARGIN, rect.bottom - maxHeight),
          left: rect.right + 4,
          maxHeight,
        });
      }
    }
    setIsOpen(true);
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setIsOpen(false), 150);
  };

  const closeNow = () => {
    clearCloseTimer();
    setIsOpen(false);
  };

  useEffect(() => clearCloseTimer, []);

  // Desktop-only safety nets: close if the sidebar itself scrolls (the
  // flyout's position was computed at open time — Part 15) or the admin
  // clicks anywhere outside this category (covers a keyboard-focus-opened
  // menu that the mouse then clicks away from without crossing scheduleClose).
  useEffect(() => {
    if (!isDesktop || !isOpen) return undefined;
    const navEl = triggerRef.current?.closest('nav');
    const handleScroll = () => closeNow();
    const handleOutsideClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) closeNow();
    };
    navEl?.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      navEl?.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousedown', handleOutsideClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, isOpen]);

  // Part 8 — when the flyout opens, make sure the currently-active child (if
  // any) is visible, without being "aggressive": `block: 'nearest'` is a
  // no-op if it's already in view, and this only runs once per open (not on
  // every hover/scroll), so it never fights a manual scroll the admin is
  // mid-way through.
  useEffect(() => {
    if (isDesktop && isOpen) activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isDesktop, isOpen]);

  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Escape') {
      closeNow();
      triggerRef.current?.focus();
    } else if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && isDesktop) {
      e.preventDefault();
      openNow();
    }
  }

  const showFlyout = isDesktop && isOpen && flyoutPos;

  return (
    <div
      ref={containerRef}
      className="relative mb-1"
      onMouseEnter={isDesktop ? openNow : undefined}
      onMouseLeave={isDesktop ? scheduleClose : undefined}
      onBlur={
        isDesktop
          ? (e: React.FocusEvent<HTMLDivElement>) => {
              // The flyout is a plain DOM sibling of the trigger (deliberately
              // not a portal — see the component doc comment), so a keyboard
              // user Tabbing straight through it never leaves this container
              // until they Tab past its last link — only THEN does closing
              // make sense, not on every intermediate blur within the group.
              if (!containerRef.current?.contains(e.relatedTarget as Node | null)) closeNow();
            }
          : undefined
      }
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => setIsOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        onFocus={isDesktop ? openNow : undefined}
        title={collapsed ? label : undefined}
        className={cn(
          'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors',
          isActiveCategory
            ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800',
        )}
      >
        <span className="truncate">{collapsed ? label.slice(0, 1) : label}</span>
        {!collapsed && (
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={cn(
              'ml-2 h-4 w-4 flex-shrink-0 transition-transform',
              isOpen ? (isDesktop ? '-rotate-90' : 'rotate-180') : '',
            )}
            fill="currentColor"
          >
            <path fillRule="evenodd" d={CHEVRON_PATH} clipRule="evenodd" />
          </svg>
        )}
      </button>

      {/* Mobile/tablet — inline accordion, no hover, no fixed positioning. */}
      {!isDesktop && isOpen && (
        <ul id={menuId} className="mt-0.5 space-y-0.5 border-l border-gray-100 pl-3 dark:border-gray-800">
          {items.map((item) => (
            <li key={item.key}>
              <NavItemLink item={item} collapsed={false} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      )}

      {/* Desktop — fixed-position flyout (see component doc comment for why this deliberately isn't a portal). */}
      {showFlyout && (
        <div
          ref={flyoutRef}
          id={menuId}
          role="menu"
          aria-label={label}
          style={{ top: flyoutPos.top, left: flyoutPos.left, maxHeight: flyoutPos.maxHeight }}
          // Part 3/6/7 — scrollable with a themed (not hidden) scrollbar once
          // content exceeds `maxHeight`; `overscroll-contain` stops the
          // scroll from "chaining" into the sidebar's own nav list or the
          // page once this panel's own scroll hits its end (Part 2/6: the
          // admin page must not scroll because of the submenu).
          className="themed-scrollbar fixed z-50 min-w-[14rem] max-w-xs overflow-y-auto overflow-x-hidden overscroll-contain rounded-md border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
          onMouseEnter={clearCloseTimer}
          onMouseLeave={scheduleClose}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              closeNow();
              triggerRef.current?.focus();
            }
          }}
        >
          <p className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {label}
          </p>
          {items.map((item) => {
            const active = isItemActive(pathname, item);
            return (
              <NavLink
                key={item.key}
                ref={active ? activeItemRef : undefined}
                to={item.path}
                role="menuitem"
                onClick={() => {
                  closeNow();
                  onNavigate?.();
                }}
                className={cn(
                  'block px-3 py-2 text-sm',
                  active
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-400'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-800',
                )}
              >
                {item.label}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
