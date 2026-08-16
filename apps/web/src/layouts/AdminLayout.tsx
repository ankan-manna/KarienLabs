import { useState } from 'react';
import { Outlet } from 'react-router-dom';

import { Sidebar } from '../components/layout/Sidebar';
import { Topbar } from '../components/layout/Topbar';
import {
  CMS_MENU,
  CUSTOMER_MENU,
  DASHBOARD_MENU,
  DELIVERY_MENU,
  INVENTORY_MENU,
  NOTIFICATIONS_MENU,
  ORDER_MENU,
  PAYMENT_MENU,
  PRODUCT_MENU,
  REPORTS_MENU,
  SUPER_ADMIN_MENU,
  TAX_MENU,
} from '../constants/menu';

export function AdminLayout() {
  // Prompt 33 Part 13/44 — no mobile/tablet admin nav existed before this
  // prompt (the sidebar was simply always rendered at a fixed width); this
  // is the minimal state needed to drive the new off-canvas drawer below
  // the desktop breakpoint. Desktop behavior (always-visible sidebar) is
  // unaffected — Sidebar.tsx ignores these props once `useIsDesktop()` is true.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-gray-950">
      <Sidebar
        title="KarienLabs Admin"
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        sections={[
          { items: DASHBOARD_MENU },
          { label: 'Catalog', items: PRODUCT_MENU },
          { label: 'Inventory', items: INVENTORY_MENU },
          { label: 'Sales', items: ORDER_MENU },
          { label: 'Customers', items: CUSTOMER_MENU },
          { label: 'Payments', items: PAYMENT_MENU },
          { label: 'Delivery & Shipping', items: DELIVERY_MENU },
          { label: 'Tax & GST', items: TAX_MENU },
          { label: 'CMS', items: CMS_MENU },
          { label: 'Notifications', items: NOTIFICATIONS_MENU },
          { label: 'Reports', items: REPORTS_MENU },
          { label: 'Platform', items: SUPER_ADMIN_MENU },
        ]}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
