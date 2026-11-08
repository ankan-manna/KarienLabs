import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { useStructuredData } from '../hooks/useDocumentMeta';
import { useInventoryEvents } from '../modules/storefront/hooks/useInventoryEvents';

// react-router-dom's plain <BrowserRouter> (no ScrollRestoration, which is
// data-router-only) keeps the browser's native scroll position across SPA
// navigations — so clicking a product/category/blog card from partway down
// a long page lands the visitor at that same scroll offset on the new page
// instead of its top. Pathname-only (not search-param) so an in-page filter
// change (e.g. /products?categoryId=...) never yanks scroll position away
// from someone adjusting filters.
function ScrollToTopOnNavigate() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// Site-wide Organization + WebSite JSON-LD (docs/BRENTIS_SEO_GEO_AEO_STRATEGY.md
// §4/§7 item 3.7) — rendered once here rather than per-page. Deliberately
// omits `address`/`telephone`: ContactPage.tsx's current address/phone are
// confirmed placeholder values (see that file's own comment), and
// structured data must never assert placeholder data as fact to a crawler.
// `sameAs` reuses the exact real social URLs Footer.tsx already uses — no
// new accounts invented here either.
const ORGANIZATION_SCHEMA = {
  '@type': 'Organization',
  name: 'BRENTIS HEALTHCARE',
  url: typeof window !== 'undefined' ? window.location.origin : '',
  sameAs: [
    'https://www.instagram.com/karien.labs/',
    'https://www.youtube.com/@KarienLabs',
    'https://www.linkedin.com/company/karien-labs/',
    'https://x.com/Karienlabs',
    'https://www.facebook.com/profile.php?id=61592521003048',
  ],
};

const WEBSITE_SCHEMA = {
  '@type': 'WebSite',
  name: 'BRENTIS HEALTHCARE',
  url: typeof window !== 'undefined' ? window.location.origin : '',
};

export function PublicLayout() {
  useInventoryEvents();
  useStructuredData(ORGANIZATION_SCHEMA);
  useStructuredData(WEBSITE_SCHEMA);

  return (
    <div className="flex min-h-screen flex-col bg-soft-mint dark:bg-night">
      <ScrollToTopOnNavigate />
      <Header />

      <main className="mx-auto w-full max-w-[1920px] flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
