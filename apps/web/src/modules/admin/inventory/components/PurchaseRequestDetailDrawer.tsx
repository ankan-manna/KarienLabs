import { useEffect, useState } from 'react';

import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { ConfirmDialog } from '../../../../components/common/ConfirmDialog';
import { Drawer } from '../../../../components/common/Drawer';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { Skeleton } from '../../../../components/common/Skeleton';
import { Textarea } from '../../../../components/common/Textarea';
import { formatDateTime } from '../../../../utils/format';
import {
  useAdminPurchaseRequest,
  useApprovePurchaseRequest,
  useConvertPurchaseRequest,
  useRejectPurchaseRequest,
} from '../hooks/useAdminPurchaseRequests';
import { supplierHooks } from '../hooks/useSuppliers';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  pending: 'blue',
  approved: 'yellow',
  rejected: 'red',
  converted: 'green',
};

export function PurchaseRequestDetailDrawer({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data: pr, isLoading } = useAdminPurchaseRequest(id);
  const approve = useApprovePurchaseRequest();
  const reject = useRejectPurchaseRequest();
  const convert = useConvertPurchaseRequest();
  const { data: suppliers } = supplierHooks.useList({ page: 1, limit: 100 });

  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const [supplierId, setSupplierId] = useState('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState('');
  const [unitCosts, setUnitCosts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!pr) return;
    setSupplierId('');
    setExpectedDeliveryDate('');
    setUnitCosts(
      Object.fromEntries(
        pr.items.map((item, i) => [i, item.estimatedUnitCost ? String(item.estimatedUnitCost) : '']),
      ),
    );
  }, [pr]);

  const supplierOptions = (suppliers?.items ?? []).map((s) => ({ label: s.name, value: s._id }));

  function submitConvert() {
    if (!pr) return;
    convert.mutate(
      {
        id: pr._id,
        input: {
          supplierId,
          items: pr.items.map((item, i) => ({
            productId: item.productId,
            quantityOrdered: item.quantity,
            unitCost: Number(unitCosts[i] || 0),
          })),
          expectedDeliveryDate: expectedDeliveryDate || undefined,
        },
      },
      { onSuccess: () => onClose() },
    );
  }

  const convertValid = supplierId && pr?.items.every((_, i) => Number(unitCosts[i]) > 0);

  return (
    <Drawer
      isOpen={!!id}
      onClose={onClose}
      title={pr ? pr.requestNumber : 'Purchase Request'}
      width="md"
    >
      {isLoading || !pr ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <Badge tone={STATUS_TONE[pr.status] ?? 'gray'}>{pr.status}</Badge>
            <span className="text-sm text-gray-500">{formatDateTime(pr.createdAt)}</span>
          </div>

          <div className="text-sm text-gray-500 dark:text-gray-400">
            Warehouse: <span className="font-mono text-gray-700 dark:text-gray-200">{pr.warehouseId}</span>
          </div>

          {pr.notes && (
            <p className="text-sm text-gray-600 dark:text-gray-300">{pr.notes}</p>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              Requested Items
            </h3>
            <ul className="flex flex-col gap-2">
              {pr.items.map((item, i) => (
                <li
                  key={i}
                  className="rounded-md border border-gray-100 p-3 text-sm dark:border-gray-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-gray-700 dark:text-gray-200">
                      {item.productId}
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      Qty: {item.quantity}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-gray-500 dark:text-gray-400">
                    <span>{item.notes || '—'}</span>
                    {item.estimatedUnitCost != null && (
                      <span>Est. unit cost: {item.estimatedUnitCost}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {pr.status === 'rejected' && pr.rejectionReason && (
            <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              Rejection reason: {pr.rejectionReason}
            </div>
          )}

          <Can I="approve" a="purchase_orders">
            <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Workflow Actions
              </h3>

              {pr.status === 'pending' && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" isLoading={approve.isPending} onClick={() => approve.mutate(pr._id)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setShowReject(true)}>
                    Reject
                  </Button>
                </div>
              )}

              {pr.status === 'approved' && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Convert this request into a purchase order.
                  </p>
                  <Select
                    label="Supplier"
                    placeholder="Select a supplier"
                    options={supplierOptions}
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  />
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Unit Cost per Item
                    </span>
                    {pr.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-full font-mono text-xs text-gray-500">
                          {item.productId} (qty {item.quantity})
                        </span>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={unitCosts[i] ?? ''}
                          onChange={(e) =>
                            setUnitCosts((prev) => ({ ...prev, [i]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <Input
                    label="Expected Delivery Date (optional)"
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!convertValid}
                      isLoading={convert.isPending}
                      onClick={submitConvert}
                    >
                      Convert to Purchase Order
                    </Button>
                  </div>
                </div>
              )}

              {['rejected', 'converted'].includes(pr.status) && (
                <p className="text-sm text-gray-500">No further action available.</p>
              )}
            </div>
          </Can>
        </div>
      )}

      <ConfirmDialog
        isOpen={showReject}
        title="Reject purchase request"
        message={
          <div className="flex flex-col gap-2">
            <p>Provide a reason for rejecting this request.</p>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection..."
              rows={3}
            />
          </div>
        }
        confirmLabel="Reject"
        isDangerous
        isLoading={reject.isPending}
        onConfirm={() => {
          if (!pr || rejectReason.trim().length < 1) return;
          reject.mutate(
            { id: pr._id, reason: rejectReason.trim() },
            { onSuccess: () => setShowReject(false) },
          );
        }}
        onCancel={() => setShowReject(false)}
      />
    </Drawer>
  );
}
