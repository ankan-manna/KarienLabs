import { useState } from 'react';

import type { QcResult } from '../../../../api/returns.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { ConfirmDialog } from '../../../../components/common/ConfirmDialog';
import { Drawer } from '../../../../components/common/Drawer';
import { Select } from '../../../../components/common/Select';
import { Skeleton } from '../../../../components/common/Skeleton';
import { Textarea } from '../../../../components/common/Textarea';
import { formatCurrency, formatDateTime } from '../../../../utils/format';
import {
  useAdminReturn,
  useApproveReturn,
  useCreateReturnReverseShipment,
  useDownloadReturnLabel,
  useInspectReturn,
  useMarkReturnPickedUp,
  useReceiveReturn,
  useRejectReturn,
  useResolveReturnRefund,
  useResolveReturnReplacement,
  useSyncReturnTracking,
} from '../hooks/useAdminReturns';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  requested: 'blue',
  approved: 'yellow',
  rejected: 'red',
  picked_up: 'yellow',
  received: 'yellow',
  inspected: 'yellow',
  refunded: 'green',
  replaced: 'green',
};

const QC_OPTIONS: { label: string; value: QcResult }[] = [
  { label: 'Sellable', value: 'sellable' },
  { label: 'Damaged', value: 'damaged' },
  { label: 'Expired', value: 'expired' },
  { label: 'Tampered', value: 'tampered' },
];

export function ReturnDetailDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: ret, isLoading } = useAdminReturn(id);
  const approve = useApproveReturn();
  const reject = useRejectReturn();
  const createReverseShipment = useCreateReturnReverseShipment();
  const syncTracking = useSyncReturnTracking();
  const downloadLabel = useDownloadReturnLabel();
  const pickUp = useMarkReturnPickedUp();
  const receive = useReceiveReturn();
  const inspect = useInspectReturn();
  const resolveRefund = useResolveReturnRefund();
  const resolveReplacement = useResolveReturnReplacement();

  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [qcByItem, setQcByItem] = useState<Record<string, QcResult>>({});

  return (
    <Drawer
      isOpen={!!id}
      onClose={() => {
        onClose();
        setQcByItem({});
      }}
      title={ret ? `Return ${ret.returnNumber || ret._id}` : 'Return'}
      width="md"
    >
      {isLoading || !ret ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <Badge tone={STATUS_TONE[ret.status] ?? 'gray'}>{ret.status}</Badge>
            <span className="text-sm text-gray-500">{formatDateTime(ret.createdAt)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Order</p>
              <p className="font-mono text-gray-900 dark:text-gray-100">{ret.orderId}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Resolution</p>
              <p className="text-gray-900 dark:text-gray-100">{ret.resolutionType ?? '—'}</p>
            </div>
            {ret.rejectionReason && (
              <div className="col-span-2">
                <p className="text-gray-500 dark:text-gray-400">Rejection Reason</p>
                <p className="text-red-600 dark:text-red-400">{ret.rejectionReason}</p>
              </div>
            )}
            {ret.replacementOrderId && (
              <div className="col-span-2">
                <p className="text-gray-500 dark:text-gray-400">Replacement Order</p>
                <p className="font-mono text-gray-900 dark:text-gray-100">{ret.replacementOrderId}</p>
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Items</h3>
            <ul className="flex flex-col gap-2">
              {ret.items.map((item, i) => (
                <li key={i} className="rounded-md border border-gray-100 p-3 text-sm dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {item.name || item.orderItemId} × {item.quantity}
                    </span>
                    {item.unitPrice != null && (
                      <span className="text-gray-500">{formatCurrency(item.unitPrice)}</span>
                    )}
                  </div>
                  <p className="mt-1 text-gray-500 dark:text-gray-400">Reason: {item.reason}</p>
                  {item.description && <p className="text-gray-400">{item.description}</p>}
                  {item.evidenceUrls && item.evidenceUrls.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-2">
                      {item.evidenceUrls.map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          <img src={url} alt="Return evidence" className="h-14 w-14 rounded object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                  {item.qcResult && (
                    <div className="mt-1 flex items-center gap-2">
                      <Badge tone={item.qcResult === 'sellable' ? 'green' : 'red'}>{item.qcResult}</Badge>
                      {item.restocked && <Badge tone="blue">Restocked</Badge>}
                    </div>
                  )}
                  {ret.status === 'received' && (
                    <div className="mt-2 max-w-[200px]">
                      <Select
                        label="QC Result"
                        placeholder="Select outcome"
                        value={qcByItem[item.orderItemId] ?? ''}
                        onChange={(e) =>
                          setQcByItem((prev) => ({ ...prev, [item.orderItemId]: e.target.value as QcResult }))
                        }
                        options={QC_OPTIONS}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {(ret.reverseShipment?.shiprocketOrderId || ret.status === 'approved') && (
            <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
              <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
                Reverse Shipment
              </h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-gray-500 dark:text-gray-400">AWB</p>
                  <p className="font-mono text-gray-900 dark:text-gray-100">
                    {ret.reverseShipment?.awbCode || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Courier</p>
                  <p className="text-gray-900 dark:text-gray-100">{ret.reverseShipment?.courierName || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500 dark:text-gray-400">Status</p>
                  <p className="text-gray-900 dark:text-gray-100">{ret.reverseShipment?.status || '—'}</p>
                </div>
              </div>
              {ret.reverseShipment?.lastError && (
                <Can I="approve" a="returns">
                  <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                    {ret.reverseShipment.lastError}
                  </p>
                </Can>
              )}
              <Can I="approve" a="returns">
                <div className="mt-2 flex flex-wrap gap-2">
                  {!ret.reverseShipment?.shiprocketOrderId && (
                    <Button
                      size="sm"
                      isLoading={createReverseShipment.isPending}
                      onClick={() => createReverseShipment.mutate(ret._id)}
                    >
                      Create Reverse Shipment
                    </Button>
                  )}
                  {ret.reverseShipment?.awbCode && (
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={syncTracking.isPending}
                      onClick={() => syncTracking.mutate(ret._id)}
                    >
                      Sync Tracking
                    </Button>
                  )}
                  {ret.reverseShipment?.shiprocketShipmentId && (
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={downloadLabel.isPending}
                      onClick={() => downloadLabel.mutate(ret._id)}
                    >
                      {ret.reverseShipment.labelUrl ? 'Download Label' : 'Generate & Download Label'}
                    </Button>
                  )}
                </div>
              </Can>
            </div>
          )}

          <Can I="approve" a="returns">
            <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Workflow Actions
              </h3>
              <div className="flex flex-wrap gap-2">
                {ret.status === 'requested' && (
                  <>
                    <Button size="sm" isLoading={approve.isPending} onClick={() => approve.mutate(ret._id)}>
                      Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setShowReject(true)}>
                      Reject
                    </Button>
                  </>
                )}
                {ret.status === 'approved' && (
                  <Button size="sm" isLoading={pickUp.isPending} onClick={() => pickUp.mutate(ret._id)}>
                    Mark Picked Up
                  </Button>
                )}
                {ret.status === 'picked_up' && (
                  <Button size="sm" isLoading={receive.isPending} onClick={() => receive.mutate(ret._id)}>
                    Mark Received
                  </Button>
                )}
                {ret.status === 'received' && (
                  <Button
                    size="sm"
                    isLoading={inspect.isPending}
                    disabled={ret.items.some((i) => !qcByItem[i.orderItemId])}
                    onClick={() =>
                      inspect.mutate({
                        id: ret._id,
                        items: ret.items.map((i) => ({
                          orderItemId: i.orderItemId,
                          qcResult: qcByItem[i.orderItemId],
                        })),
                      })
                    }
                  >
                    Submit Inspection
                  </Button>
                )}
                {ret.status === 'inspected' && (
                  <>
                    <Button
                      size="sm"
                      isLoading={resolveRefund.isPending}
                      onClick={() => resolveRefund.mutate(ret._id)}
                    >
                      Resolve as Refund
                    </Button>
                    {ret.items.some((i) => i.qcResult) && (
                      <Button
                        size="sm"
                        variant="secondary"
                        isLoading={resolveReplacement.isPending}
                        onClick={() => resolveReplacement.mutate(ret._id)}
                      >
                        Resolve as Replacement
                      </Button>
                    )}
                  </>
                )}
                {['rejected', 'refunded', 'replaced'].includes(ret.status) && (
                  <p className="text-sm text-gray-500">No further action available.</p>
                )}
              </div>
            </div>
          </Can>
        </div>
      )}

      <ConfirmDialog
        isOpen={showReject}
        title="Reject return request"
        message={
          <div className="flex flex-col gap-2">
            <p>Provide a reason for rejecting this return.</p>
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
          if (!ret || rejectReason.trim().length < 3) return;
          reject.mutate(
            { id: ret._id, reason: rejectReason.trim() },
            { onSuccess: () => setShowReject(false) },
          );
        }}
        onCancel={() => setShowReject(false)}
      />
    </Drawer>
  );
}
