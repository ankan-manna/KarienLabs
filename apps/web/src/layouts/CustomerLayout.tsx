import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import { CUSTOMER_ACCOUNT_MENU } from '../constants/menu';

/** Wraps authenticated-only account pages (profile/orders/addresses/...) with a lightweight account sidebar. */
export function CustomerLayout() {
  // Mirrors AdminLayout's off-canvas mobile drawer wiring (Sidebar already
  // supports it via mobileOpen/onCloseMobile — this was simply never opted
  // into here before, leaving the account nav inaccessible below the
  // desktop breakpoint).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar
        title="My Account"
        sections={[{ items: CUSTOMER_ACCOUNT_MENU }]}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        logoHref="/"
      />
      <div className="flex flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
