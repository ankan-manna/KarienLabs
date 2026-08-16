import { Badge } from '../../../../components/common/Badge';
import { EntityDrawer } from '../../../../components/common/EntityDrawer';
import { Skeleton } from '../../../../components/common/Skeleton';
import { formatCurrency, formatDate, formatDateTime } from '../../../../utils/format';
import { useCustomerDetail, useSetCustomerStatus } from '../hooks/useAdminCustomers';

interface CustomerDetailDrawerProps {
  customerId: string | null;
  onClose: () => void;
}

export function CustomerDetailDrawer({ customerId, onClose }: CustomerDetailDrawerProps) {
  const { data, isLoading } = useCustomerDetail(customerId);
  const setStatusMutation = useSetCustomerStatus();

  if (!customerId) return null;

  return (
    <EntityDrawer
      isOpen={!!customerId}
      onClose={onClose}
      title={data?.user.name ?? 'Customer'}
      resource="customers"
      resourceId={customerId}
      meta={{ createdAt: data?.user.createdAt }}
      onDelete={
        data
          ? () =>
              setStatusMutation.mutate({ id: customerId, isActive: !data.user.isActive })
          : undefined
      }
      general={
        isLoading || !data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <dt className="text-gray-500">Email</dt>
              <dd>{data.user.email}</dd>
              <dt className="text-gray-500">Status</dt>
              <dd>
                <Badge tone={data.user.isActive ? 'green' : 'gray'}>
                  {data.user.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </dd>
              <dt className="text-gray-500">Email Verified</dt>
              <dd>{data.user.emailVerified ? 'Yes' : 'No'}</dd>
              <dt className="text-gray-500">Joined</dt>
              <dd>{formatDate(data.user.createdAt)}</dd>
              <dt className="text-gray-500">Orders</dt>
              <dd>{data.orderCount}</dd>
              <dt className="text-gray-500">Total Spent</dt>
              <dd>{formatCurrency(data.totalSpent)}</dd>
              <dt className="text-gray-500">Wishlist Items</dt>
              <dd>{data.wishlistItemCount}</dd>
            </dl>
            <div className="border-t border-gray-200 pt-3 dark:border-gray-800">
              <button
                type="button"
                className="text-sm font-medium text-brand-600 hover:underline"
                onClick={() => setStatusMutation.mutate({ id: customerId, isActive: !data.user.isActive })}
              >
                {data.user.isActive ? 'Deactivate customer' : 'Activate customer'}
              </button>
            </div>
          </div>
        )
      }
      related={
        !data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="flex flex-col gap-5">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Addresses ({data.addresses.length})
              </h3>
              {data.addresses.length === 0 ? (
                <p className="text-sm text-gray-500">No addresses saved</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {data.addresses.map((a) => (
                    <li key={String(a._id)} className="rounded border border-gray-200 p-2 dark:border-gray-800">
                      {String(a.line1)}, {String(a.city)}, {String(a.state)} {String(a.pincode)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Recent Orders ({data.orderCount})
              </h3>
              {data.orders.length === 0 ? (
                <p className="text-sm text-gray-500">No orders yet</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {data.orders.slice(0, 10).map((o) => (
                    <li
                      key={String(o._id)}
                      className="flex items-center justify-between rounded border border-gray-200 p-2 dark:border-gray-800"
                    >
                      <span>{String(o.orderNumber)}</span>
                      <span>{formatCurrency((o.totals as { grandTotal: number })?.grandTotal ?? 0)}</span>
                      <Badge tone="gray">{String(o.status)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Prescriptions ({data.prescriptions.length})
              </h3>
              {data.prescriptions.length === 0 ? (
                <p className="text-sm text-gray-500">None uploaded</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {data.prescriptions.map((p) => (
                    <li
                      key={String(p._id)}
                      className="flex items-center justify-between rounded border border-gray-200 p-2 dark:border-gray-800"
                    >
                      <span>{formatDateTime(String(p.createdAt))}</span>
                      <Badge tone="gray">{String(p.status)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )
      }
    />
  );
}
