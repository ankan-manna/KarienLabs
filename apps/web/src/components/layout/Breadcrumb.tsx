import { Link, useLocation } from 'react-router-dom';

import { useStructuredData } from '../../hooks/useDocumentMeta';

function toLabel(segment: string): string {
  return segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface BreadcrumbProps {
  /** Optional explicit trail (e.g. "Home / Vitamins / Daily Multivitamin
   * Capsules") — overrides the auto-derived-from-URL behavior below, which
   * exists for admin/customer-account Topbar usage where a slug/ID segment
   * would otherwise render as unreadable raw text. Every new storefront
   * call site (PLP/PDP/etc.) should pass this rather than rely on the
   * URL-derived fallback. Purely additive — no existing caller passes it,
   * so Topbar's admin/account usage is unaffected. */
  items?: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps = {}) {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  const trail: BreadcrumbItem[] =
    items ?? segments.map((segment, i) => ({ label: toLabel(segment), to: '/' + segments.slice(0, i + 1).join('/') }));

  // BreadcrumbList JSON-LD (docs/BRENTIS_SEO_GEO_AEO_STRATEGY.md §2 item 9) —
  // only when an explicit `items` trail was passed (i.e. a real storefront
  // page opted in), never for the URL-auto-derived admin/account fallback,
  // where a raw path segment isn't a meaningful crawlable breadcrumb anyway.
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  useStructuredData(
    items && items.length > 0
      ? {
          '@type': 'BreadcrumbList',
          itemListElement: [{ label: 'Home', to: '/' }, ...items].map((item, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: item.label,
            ...(item.to ? { item: `${origin}${item.to}` } : {}),
          })),
        }
      : null,
  );

  if (trail.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="text-sm text-gray-500">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li>
          <Link to="/" className="hover:text-gray-700 dark:hover:text-gray-300">
            Home
          </Link>
        </li>
        {trail.map((item, i) => {
          const isLast = i === trail.length - 1;
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1.5">
              <span className="text-gray-300 dark:text-gray-700" aria-hidden="true">
                /
              </span>
              {isLast || !item.to ? (
                <span aria-current={isLast ? 'page' : undefined} className="font-medium text-gray-700 dark:text-gray-300">
                  {item.label}
                </span>
              ) : (
                <Link to={item.to} className="hover:text-gray-700 dark:hover:text-gray-300">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
