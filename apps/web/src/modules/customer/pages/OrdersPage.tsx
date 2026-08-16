import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { listMyOrders } from '../../../api/orders.api';
import { Badge } from '../../../components/common/Badge';
import { Card } from '../../../components/common/Card';
import { EmptyState } from '../../../components/common/EmptyState';
import { SkeletonRows } from '../../../components/common/Skeleton';
import { formatCurrency, formatDate } from '../../../utils/format';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  placed: 'blue',
  confirmed: 'blue',
  packed: 'yellow',
  shipped: 'yellow',
  delivered: 'green',
  returned: 'red',
  cancelled: 'red',
};

export default function OrdersPage() {
  const { data: orders, isLoading } = useQuery({ queryKey: ['my-orders'], queryFn: listMyOrders });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Orders</h1>

      {isLoading ? (
        <SkeletonRows rows={4} columns={3} />
      ) : !orders || orders.length === 0 ? (
        <EmptyState title="No orders yet" />
      ) : (
        <div className="flex flex-col gap-2">
          {orders.map((order) => (
            <Link key={order._id} to={`/account/orders/${order._id}`}>
              <Card className="flex items-center justify-between p-4 hover:border-brand-300">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {order.orderNumber}
                  </p>
                  <p className="text-xs text-gray-500">{formatDate(order.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={STATUS_TONE[order.status] ?? 'gray'}>{order.status}</Badge>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {formatCurrency(order.totals.grandTotal)}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
