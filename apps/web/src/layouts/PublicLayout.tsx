import { Outlet } from 'react-router-dom';

import { Footer } from '../components/layout/Footer';
import { Header } from '../components/layout/Header';
import { useInventoryEvents } from '../modules/storefront/hooks/useInventoryEvents';

export function PublicLayout() {
  useInventoryEvents();

  return (
    <div className="flex min-h-screen flex-col bg-soft-mint dark:bg-night">
      <Header />

      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
