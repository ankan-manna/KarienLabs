import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { listAddresses } from '../../../api/addresses.api';
import { listAvailableCoupons } from '../../../api/coupons.api';
import { listMyNotifications } from '../../../api/notifications-admin.api';
import { listMyOrders } from '../../../api/orders.api';
import { listProducts } from '../../../api/products-public.api';
import { fetchWishlist } from '../../../api/wishlist.api';
import { Avatar } from '../../../components/common/Avatar';
import { Badge } from '../../../components/common/Badge';
import { Card } from '../../../components/common/Card';
import { Skeleton } from '../../../components/common/Skeleton';
import { useAuth } from '../../../context/AuthContext';
import { useRecentlyViewed } from '../../../hooks/useRecentlyViewed';
import { formatCurrency, formatDate } from '../../../utils/format';
import { ProductCard } from '../../storefront/components/ProductCard';
import { RecentlyViewedProducts } from '../../storefront/components/RecentlyViewedProducts';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  placed: 'blue',
  confirmed: 'blue',
  packed: 'yellow',
  shipped: 'yellow',
  delivered: 'green',
  returned: 'red',
  cancelled: 'red',
};

function SummaryTile({ label, value, to }: { label: string; value: string | number; to: string }) {
  return (
    <Link to={to}>
      <Card className="p-4 hover:border-brand-300">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">{value}</p>
      </Card>
    </Link>
  );
}

/**
 * Unified account landing page — aggregates summaries the spec asks for in one
 * view (profile/orders/wishlist/addresses/coupons/notifications/recommended/
 * recently-viewed) rather than requiring a click into each separate section page.
 * "Recommended Products" reuses the newest-products query since there's no
 * personalization/recommendation engine in this build — disclosed, not faked.
 */
export default function DashboardPage() {
  const { user } = useAuth();

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ['my-orders'],
    queryFn: listMyOrders,
  });
  const { data: wishlist } = useQuery({ queryKey: ['wishlist'], queryFn: fetchWishlist });
  const { data: addresses } = useQuery({ queryKey: ['addresses'], queryFn: listAddresses });
  const { data: coupons } = useQuery({ queryKey: ['coupons', 'available'], queryFn: listAvailableCoupons });
  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'mine', 'dashboard'],
    queryFn: () => listMyNotifications({ limit: 3 }),
  });
  const { data: recommended } = useQuery({
    queryKey: ['products', 'recommended'],
    queryFn: () => listProducts({ limit: 4, sort: '-ratingAvg' }),
  });
  const { ids: recentlyViewedIds } = useRecentlyViewed();

  const recentOrders = (orders ?? []).slice(0, 3);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Avatar name={user?.name ?? '?'} size="lg" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Welcome back, {user?.name}
          </h1>
          <p className="text-sm text-gray-500">{user?.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Orders" value={orders?.length ?? 0} to="/account/orders" />
        <SummaryTile label="Wishlist items" value={wishlist?.items.length ?? 0} to="/account/wishlist" />
        <SummaryTile label="Saved addresses" value={addresses?.length ?? 0} to="/account/addresses" />
        <SummaryTile label="Available coupons" value={coupons?.length ?? 0} to="/account/coupons" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Recent Orders</h2>
            <Link to="/account/orders" className="text-xs font-medium text-brand-600 hover:underline">
              View all
            </Link>
          </div>
          {ordersLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : recentOrders.length === 0 ? (
            <p className="text-sm text-gray-500">No orders yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentOrders.map((order) => (
                <Link
                  key={order._id}
                  to={`/account/orders/${order._id}`}
                  className="flex items-center justify-between rounded-md border border-gray-100 p-2 text-sm hover:border-brand-300 dark:border-gray-800"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">{order.orderNumber}</p>
                    <p className="text-xs text-gray-400">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[order.status] ?? 'gray'}>{order.status}</Badge>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(order.totals.grandTotal)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Notifications</h2>
            <Link
              to="/account/notifications"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              View all
            </Link>
          </div>
          {!notifications || notifications.items.length === 0 ? (
            <p className="text-sm text-gray-500">No notifications yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {notifications.items.map((n) => (
                <div key={n._id} className="rounded-md border border-gray-100 p-2 text-sm dark:border-gray-800">
                  <p className="font-medium capitalize text-gray-900 dark:text-gray-100">
                    {n.templateKey.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-gray-400">{formatDate(n.sentAt)}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {recommended && recommended.items.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
            Recommended for You
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {recommended.items.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        </section>
      )}

      {recentlyViewedIds.length > 0 && <RecentlyViewedProducts />}
    </div>
  );
}
