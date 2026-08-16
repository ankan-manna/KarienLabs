import { useState } from 'react';

import type { ShipmentStatus } from '../../../../api/shipments.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { Drawer } from '../../../../components/common/Drawer';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { Skeleton } from '../../../../components/common/Skeleton';
import { Textarea } from '../../../../components/common/Textarea';
import { formatDateTime } from '../../../../utils/format';
import {
  useAddDeliveryNote,
  useAdminShipment,
  useAssignShipmentAwb,
  useCreateShiprocketShipment,
  useDownloadShipmentLabel,
  useRetryShipment,
  useSyncShipmentTracking,
  useUpdateShipmentStatus,
} from '../hooks/useAdminShipments';

const STATUS_TONE: Record<string, 'gray' | 'green' | 'red' | 'yellow' | 'blue'> = {
  pending: 'gray',
  ready_for_dispatch: 'blue',
  picked_up: 'yellow',
  in_transit: 'yellow',
  out_for_delivery: 'yellow',
  delivered: 'green',
  failed: 'red',
  rto: 'red',
};

const STATUS_OPTIONS: { label: string; value: ShipmentStatus }[] = [
  { label: 'Pending', value: 'pending' },
  { label: 'Ready for Dispatch', value: 'ready_for_dispatch' },
  { label: 'Picked Up', value: 'picked_up' },
  { label: 'In Transit', value: 'in_transit' },
  { label: 'Out for Delivery', value: 'out_for_delivery' },
  { label: 'Delivered', value: 'delivered' },
  { label: 'Failed', value: 'failed' },
  { label: 'RTO', value: 'rto' },
];

export function ShipmentDetailDrawer({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const { data: shipment, isLoading } = useAdminShipment(id);
  const updateStatus = useUpdateShipmentStatus();
  const addNote = useAddDeliveryNote();
  const createShiprocket = useCreateShiprocketShipment();
  const retry = useRetryShipment();
  const assignAwb = useAssignShipmentAwb();
  const syncTracking = useSyncShipmentTracking();
  const downloadLabel = useDownloadShipmentLabel();

  const [nextStatus, setNextStatus] = useState<ShipmentStatus | ''>('');
  const [location, setLocation] = useState('');
  const [remarks, setRemarks] = useState('');
  const [note, setNote] = useState('');

  return (
    <Drawer
      isOpen={!!id}
      onClose={() => {
        onClose();
        setNextStatus('');
        setLocation('');
        setRemarks('');
        setNote('');
      }}
      title={shipment ? `Shipment ${shipment.trackingNumber || shipment._id}` : 'Shipment'}
      width="md"
    >
      {isLoading || !shipment ? (
        <div className="space-y-3">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <Badge tone={STATUS_TONE[shipment.status] ?? 'gray'}>{shipment.status}</Badge>
            <span className="text-sm text-gray-500">{formatDateTime(shipment.createdAt)}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Order</p>
              <p className="font-mono text-gray-900 dark:text-gray-100">{shipment.orderId}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Delivery Partner</p>
              <p className="font-mono text-gray-900 dark:text-gray-100">
                {shipment.deliveryPartnerId}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Tracking Number</p>
              <p className="text-gray-900 dark:text-gray-100">{shipment.trackingNumber || '—'}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Estimated Delivery</p>
              <p className="text-gray-900 dark:text-gray-100">
                {shipment.estimatedDeliveryDate
                  ? formatDateTime(shipment.estimatedDeliveryDate)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Dispatched At</p>
              <p className="text-gray-900 dark:text-gray-100">
                {shipment.dispatchedAt ? formatDateTime(shipment.dispatchedAt) : '—'}
              </p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Delivered At</p>
              <p className="text-gray-900 dark:text-gray-100">
                {shipment.deliveredAt ? formatDateTime(shipment.deliveredAt) : '—'}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Shiprocket Fulfillment
              </h3>
              {shipment.coldStorageRequired && <Badge tone="yellow">Cold Storage Required</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-500 dark:text-gray-400">Shiprocket Order ID</p>
                <p className="font-mono text-gray-900 dark:text-gray-100">
                  {shipment.shiprocketOrderId || '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Shipment ID</p>
                <p className="font-mono text-gray-900 dark:text-gray-100">
                  {shipment.shiprocketShipmentId || '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">AWB Code</p>
                <p className="font-mono text-gray-900 dark:text-gray-100">{shipment.awbCode || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Courier</p>
                <p className="text-gray-900 dark:text-gray-100">{shipment.courierName || '—'}</p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Weight</p>
                <p className="text-gray-900 dark:text-gray-100">
                  {shipment.weightGrams ? `${shipment.weightGrams} g` : '—'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Label Storage</p>
                <div className="flex items-center gap-2">
                  <Badge tone="gray">{shipment.storageProvider === 's3' ? 'S3' : 'Cloudinary'}</Badge>
                  {shipment.labelUrl && (
                    <Badge
                      tone={
                        shipment.documentStatus === 'failed'
                          ? 'red'
                          : shipment.documentStatus === 'expired'
                            ? 'blue'
                            : shipment.documentStatus === 'available' || !shipment.documentStatus
                              ? 'green'
                              : 'yellow'
                      }
                    >
                      {shipment.documentStatus ?? 'available'}
                    </Badge>
                  )}
                </div>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Dimensions (L×W×H mm)</p>
                <p className="text-gray-900 dark:text-gray-100">
                  {shipment.dimensions?.lengthMm
                    ? `${shipment.dimensions.lengthMm}×${shipment.dimensions.widthMm}×${shipment.dimensions.heightMm}`
                    : '—'}
                </p>
              </div>
            </div>

            {shipment.lastError && (
              <Can I="update" a="deliveries">
                <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
                  Last error: {shipment.lastError}
                </p>
              </Can>
            )}

            <Can I="update" a="deliveries">
              <div className="mt-3 flex flex-wrap gap-2">
                {!shipment.shiprocketOrderId && (
                  <Button
                    size="sm"
                    isLoading={createShiprocket.isPending}
                    onClick={() => createShiprocket.mutate(shipment.orderId)}
                  >
                    Create Shiprocket Shipment
                  </Button>
                )}
                {shipment.shiprocketOrderId && !shipment.awbCode && (
                  <Button
                    size="sm"
                    variant="secondary"
                    isLoading={assignAwb.isPending}
                    onClick={() => assignAwb.mutate(shipment._id)}
                  >
                    Assign AWB
                  </Button>
                )}
                {shipment.lastError && (
                  <Button
                    size="sm"
                    variant="secondary"
                    isLoading={retry.isPending}
                    onClick={() => retry.mutate(shipment.orderId)}
                  >
                    Retry
                  </Button>
                )}
                {shipment.awbCode && (
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={syncTracking.isPending}
                    onClick={() => syncTracking.mutate(shipment._id)}
                  >
                    Sync Tracking
                  </Button>
                )}
                {shipment.shiprocketShipmentId && (
                  <Button
                    size="sm"
                    variant="outline"
                    isLoading={downloadLabel.isPending}
                    onClick={() => downloadLabel.mutate(shipment._id)}
                  >
                    {shipment.labelUrl ? 'Download Label' : 'Generate & Download Label'}
                  </Button>
                )}
              </div>
            </Can>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
              Tracking Timeline
            </h3>
            {shipment.trackingEvents.length === 0 ? (
              <p className="text-sm text-gray-500">No tracking events yet.</p>
            ) : (
              <ul className="flex flex-col gap-3 border-l border-gray-200 pl-4 dark:border-gray-800">
                {shipment.trackingEvents.map((event, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-brand-500" />
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[event.status] ?? 'gray'}>{event.status}</Badge>
                      <span className="text-xs text-gray-500">
                        {formatDateTime(event.timestamp)}
                      </span>
                    </div>
                    {event.location && (
                      <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-200">
                        {event.location}
                      </p>
                    )}
                    {event.remarks && (
                      <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                        {event.remarks}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Can I="update" a="deliveries">
            <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Update Status
              </h3>
              <Select
                label="New status"
                placeholder="Select status"
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as ShipmentStatus)}
                options={STATUS_OPTIONS}
              />
              <Input
                label="Location (optional)"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Mumbai Hub"
              />
              <Input
                label="Remarks (optional)"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="e.g. Handed to courier"
              />
              <Button
                size="sm"
                isLoading={updateStatus.isPending}
                disabled={!nextStatus}
                onClick={() => {
                  if (!nextStatus) return;
                  updateStatus.mutate(
                    {
                      id: shipment._id,
                      input: {
                        status: nextStatus,
                        location: location.trim() || undefined,
                        remarks: remarks.trim() || undefined,
                      },
                    },
                    {
                      onSuccess: () => {
                        setNextStatus('');
                        setLocation('');
                        setRemarks('');
                      },
                    },
                  );
                }}
              >
                Update Status
              </Button>
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                Delivery Notes
              </h3>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={shipment.deliveryNotes || 'Add a delivery note...'}
                rows={3}
              />
              <Button
                size="sm"
                variant="secondary"
                isLoading={addNote.isPending}
                disabled={!note.trim()}
                onClick={() => {
                  if (!note.trim()) return;
                  addNote.mutate(
                    { id: shipment._id, note: note.trim() },
                    { onSuccess: () => setNote('') },
                  );
                }}
              >
                Save Note
              </Button>
              {shipment.deliveryNotes && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Current: {shipment.deliveryNotes}
                </p>
              )}
            </div>
          </Can>
        </div>
      )}
    </Drawer>
  );
}
