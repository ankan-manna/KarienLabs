import { forwardRef, useEffect, useRef, useState } from 'react';
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
 * Prompt 33, revised by the Admin Control Panel + Sidebar Navigation prompt
 * — categorized navigation shell. Each `section` (already the project's
 * existing grouping decision — see layouts/AdminLayout.tsx, one `label` per
 * RBAC-documented module group) renders as ONE of:
 *   - a flat single link, when it has no label (Dashboard) or collapses to
 *     exactly one visible item after permission filtering (Part 21 — never
 *     a pointless one-item dropdown)
 *   - a click-to-expand/collapse category with an inline accordion submenu
 *     (NavCategory below)
 * Desktop AND mobile/tablet now use the SAME click-to-expand inline
 * accordion — the submenu renders directly under its parent, inside the
 * sidebar's normal document flow, never as a floating/fixed-position
 * flyout. No new navigation/routing system — every link is a real
 * `NavLink` to the SAME route it always was.
 */
export function Sidebar({ title, sections, mobileOpen = false, onCloseMobile, logoHref }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  // Clicking a category while the sidebar is in icon-only collapsed mode
  // expands the whole sidebar first — there's no room to render a readable
  // inline accordion inside a 4rem-wide rail, and the old fix for that was
  // exactly the hover flyout this refactor removes. Expanding the sidebar
  // keeps everything in normal layout flow instead of resurrecting a
  // floating panel.
  const expandFromCollapsed = () => setCollapsed(false);
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
              onNavigate={onCloseMobile}
              onExpandCollapsedSidebar={expandFromCollapsed}
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
  onNavigate,
  onExpandCollapsedSidebar,
}: {
  label?: string;
  items: MenuItem[];
  collapsed: boolean;
  onNavigate?: () => void;
  onExpandCollapsedSidebar: () => void;
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
      onNavigate={onNavigate}
      onExpandCollapsedSidebar={onExpandCollapsedSidebar}
    />
  );
}

const NavItemLink = forwardRef<
  HTMLAnchorElement,
  { item: MenuItem; collapsed: boolean; onNavigate?: () => void }
>(function NavItemLink({ item, collapsed, onNavigate }, ref) {
  return (
    <NavLink
      ref={ref}
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
});

const CHEVRON_PATH =
  'M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z';

let idSeq = 0;

/**
 * A single category: label + click-to-expand/collapse inline accordion
 * submenu. Renders identically on desktop and mobile/tablet — no hover, no
 * `position: fixed`/`position: absolute` flyout, no portal. The submenu is
 * a plain sibling `<ul>` right after the trigger button, so it participates
 * in the sidebar `<nav>`'s normal document flow and its own
 * `overflow-y-auto` scrolling — it can never render outside the viewport,
 * clip, or float above unrelated content, and natural Tab order is
 * preserved automatically (no portal to detach it to the end of `<body>`).
 *
 * Each category owns its own independent `isOpen` — sibling categories are
 * NOT mutually exclusive (matching this component's own pre-existing
 * mobile-accordion behavior: multiple could already be open at once there).
 * A category auto-expands the first time it becomes the one containing the
 * active route (direct URL load or in-app navigation into it), so an admin
 * never has to manually open the parent to see where they are — see the
 * `isActiveCategory` effect below.
 */
function NavCategory({
  label,
  items,
  collapsed,
  onNavigate,
  onExpandCollapsedSidebar,
}: {
  label: string;
  items: MenuItem[];
  collapsed: boolean;
  onNavigate?: () => void;
  onExpandCollapsedSidebar: () => void;
}) {
  const { pathname } = useLocation();
  const isActiveCategory = items.some((item) => isItemActive(pathname, item));

  const [isOpen, setIsOpen] = useState(isActiveCategory);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const activeItemRef = useRef<HTMLAnchorElement>(null);
  const [menuId] = useState(() => `nav-category-${++idSeq}`);

  // Auto-expand when this category BECOMES the one holding the active
  // route (a value transition, not "every render while active") — so
  // navigating straight to a child route, or navigating into this category
  // from elsewhere, always reveals it without fighting an admin who
  // deliberately collapsed a category they're still inside.
  useEffect(() => {
    if (isActiveCategory) setIsOpen(true);
  }, [isActiveCategory]);

  // A collapsed icon-only rail and an open inline accordion can't coexist
  // legibly — there's no room for the full-text item list next to a 4rem
  // rail. `toggle()` below already expands the sidebar the moment a
  // collapsed category is CLICKED open; this covers every other way the
  // two could end up true together (the sidebar getting collapsed while
  // this category was already open, or mounting collapsed on this
  // category's own active route) by just always winning the sidebar back
  // open rather than rendering the cramped combination.
  useEffect(() => {
    if (collapsed && isOpen) onExpandCollapsedSidebar();
  }, [collapsed, isOpen, onExpandCollapsedSidebar]);

  // Keep the active child in view once the accordion opens — `block:
  // 'nearest'` is a no-op if it's already visible, and this only runs on
  // open, so it never fights a scroll the admin is mid-way through.
  useEffect(() => {
    if (isOpen) activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isOpen]);

  function toggle() {
    setIsOpen((wasOpen) => !wasOpen);
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'Escape' && isOpen) {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div className="mb-1">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={toggle}
        onKeyDown={handleTriggerKeyDown}
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
            className={cn('ml-2 h-4 w-4 flex-shrink-0 transition-transform', isOpen ? 'rotate-180' : '')}
            fill="currentColor"
          >
            <path fillRule="evenodd" d={CHEVRON_PATH} clipRule="evenodd" />
          </svg>
        )}
      </button>

      {/* Inline accordion — a normal sibling in the document flow, directly under its parent, on every screen size. */}
      {isOpen && (
        <ul id={menuId} className="mt-0.5 space-y-0.5 border-l border-gray-100 pl-3 dark:border-gray-800">
          {items.map((item) => {
            const active = isItemActive(pathname, item);
            return (
              <li key={item.key}>
                <NavItemLink
                  ref={active ? activeItemRef : undefined}
                  item={item}
                  collapsed={false}
                  onNavigate={onNavigate}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
