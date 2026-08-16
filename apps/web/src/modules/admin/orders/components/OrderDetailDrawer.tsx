import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from '@medcommerce/shared';
import { useState } from 'react';

import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { Drawer } from '../../../../components/common/Drawer';
import { Select } from '../../../../components/common/Select';
import { Skeleton } from '../../../../components/common/Skeleton';
import { formatCurrency, formatDateTime } from '../../../../utils/format';
import { useAdminOrder, useUpdateOrderStatus } from '../hooks/useAdminOrders';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  placed: 'blue',
  confirmed: 'blue',
  packed: 'yellow',
  shipped: 'yellow',
  delivered: 'green',
  returned: 'red',
  cancelled: 'red',
};

export function OrderDetailDrawer({
  orderId,
  onClose,
}: {
  orderId: string | null;
  onClose: () => void;
}) {
  const { data: order, isLoading } = useAdminOrder(orderId);
  const updateStatus = useUpdateOrderStatus();
  const [nextStatus, setNextStatus] = useState('');

  const allowedNext = order ? (ORDER_STATUS_TRANSITIONS[order.status as OrderStatus] ?? []) : [];

  return (
    <Drawer
      isOpen={!!orderId}
      onClose={onClose}
      title={order ? `Order ${order.orderNumber}` : 'Order'}
      width="lg"
    >
      {isLoading || !order ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <Badge tone={STATUS_TONE[order.status] ?? 'gray'}>{order.status}</Badge>
            <span className="text-sm text-gray-500">{formatDateTime(order.createdAt)}</span>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Items</h3>
            <table className="w-full text-left text-sm">
              <tbody>
                {order.items.map((item, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 last:border-0 dark:border-gray-800"
                  >
                    <td className="py-1.5">
                      {item.name} <span className="text-gray-400">× {item.quantity}</span>
                    </td>
                    <td className="py-1.5 text-right">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 flex justify-between text-sm font-semibold text-gray-900 dark:text-gray-100">
              <span>Total</span>
              <span>{formatCurrency(order.totals.grandTotal)}</span>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              Timeline
            </h3>
            <ol className="space-y-2 border-l border-gray-200 pl-4 dark:border-gray-800">
              {order.statusHistory.map((event, i) => (
                <li key={i} className="text-sm">
                  <span className="font-medium capitalize text-gray-800 dark:text-gray-200">
                    {event.status}
                  </span>
                  <span className="ml-2 text-gray-400">{formatDateTime(event.changedAt)}</span>
                  {event.note && <p className="text-gray-500">{event.note}</p>}
                </li>
              ))}
            </ol>
          </div>

          {allowedNext.length > 0 && (
            <Can I="update" a="orders">
              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                  Update Status
                </h3>
                <div className="flex gap-2">
                  <Select
                    placeholder="Select new status"
                    options={allowedNext.map((s) => ({ label: s, value: s }))}
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                  />
                  <Button
                    disabled={!nextStatus}
                    isLoading={updateStatus.isPending}
                    onClick={() => {
                      if (nextStatus)
                        updateStatus.mutate({ id: order._id, status: nextStatus as OrderStatus });
                      setNextStatus('');
                    }}
                  >
                    Update
                  </Button>
                </div>
              </div>
            </Can>
          )}
        </div>
      )}
    </Drawer>
  );
}
