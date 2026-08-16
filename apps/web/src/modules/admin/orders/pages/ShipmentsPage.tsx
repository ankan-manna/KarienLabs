import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import { deliveryPartnerApi } from '../../../../api/delivery.api';
import type { Shipment } from '../../../../api/shipments.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { Card } from '../../../../components/common/Card';
import { Input } from '../../../../components/common/Input';
import { Modal } from '../../../../components/common/Modal';
import { Select } from '../../../../components/common/Select';
import { Skeleton } from '../../../../components/common/Skeleton';
import { DataTable } from '../../../../components/table/DataTable';
import { formatDateTime } from '../../../../utils/format';
import { ShipmentDetailDrawer } from '../components/ShipmentDetailDrawer';
import {
  useAdminShipmentsList,
  useCreateShipment,
  useDeliveryReport,
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

const columns: ColumnDef<Shipment, unknown>[] = [
  {
    accessorKey: 'orderId',
    header: 'Order',
    enableSorting: false,
    cell: ({ row }) => (
      <span className="font-mono text-xs">{row.original.orderId.slice(-10)}</span>
    ),
  },
  {
    accessorKey: 'trackingNumber',
    header: 'Tracking Number',
    enableSorting: false,
    cell: ({ row }) => row.original.trackingNumber || '—',
  },
  {
    accessorKey: 'awbCode',
    header: 'AWB',
    enableSorting: false,
    cell: ({ row }) => row.original.awbCode || '—',
  },
  {
    accessorKey: 'courierName',
    header: 'Courier',
    enableSorting: false,
    cell: ({ row }) => row.original.courierName || '—',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    enableSorting: false,
    cell: ({ row }) => (
      <Badge tone={STATUS_TONE[row.original.status] ?? 'gray'}>{row.original.status}</Badge>
    ),
  },
  {
    accessorKey: 'estimatedDeliveryDate',
    header: 'Est. Delivery',
    cell: ({ row }) =>
      row.original.estimatedDeliveryDate ? formatDateTime(row.original.estimatedDeliveryDate) : '—',
  },
  {
    accessorKey: 'dispatchedAt',
    header: 'Dispatched',
    cell: ({ row }) => (row.original.dispatchedAt ? formatDateTime(row.original.dispatchedAt) : '—'),
  },
];

function CreateShipmentModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [orderId, setOrderId] = useState('');
  const [deliveryPartnerId, setDeliveryPartnerId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [estimatedDeliveryDate, setEstimatedDeliveryDate] = useState('');

  const createShipment = useCreateShipment();

  const [partners, setPartners] = useState<{ label: string; value: string }[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);

  const loadPartners = () => {
    if (partners.length > 0 || partnersLoading) return;
    setPartnersLoading(true);
    deliveryPartnerApi
      .list({ limit: 100 })
      .then((res) =>
        setPartners(res.items.map((p) => ({ label: `${p.name} (${p.code})`, value: p._id }))),
      )
      .finally(() => setPartnersLoading(false));
  };

  const reset = () => {
    setOrderId('');
    setDeliveryPartnerId('');
    setTrackingNumber('');
    setEstimatedDeliveryDate('');
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        onClose();
        reset();
      }}
      title="Create Shipment"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            isLoading={createShipment.isPending}
            disabled={!orderId.trim() || !deliveryPartnerId}
            onClick={() => {
              createShipment.mutate(
                {
                  orderId: orderId.trim(),
                  deliveryPartnerId,
                  trackingNumber: trackingNumber.trim() || undefined,
                  estimatedDeliveryDate: estimatedDeliveryDate || undefined,
                },
                {
                  onSuccess: () => {
                    onClose();
                    reset();
                  },
                },
              );
            }}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Order ID"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          placeholder="Order ObjectId"
        />
        <Select
          label="Delivery Partner"
          placeholder={partnersLoading ? 'Loading...' : 'Select partner'}
          value={deliveryPartnerId}
          onFocus={loadPartners}
          onChange={(e) => setDeliveryPartnerId(e.target.value)}
          options={partners}
        />
        <Input
          label="Tracking Number (optional)"
          value={trackingNumber}
          onChange={(e) => setTrackingNumber(e.target.value)}
        />
        <Input
          label="Estimated Delivery Date (optional)"
          type="date"
          value={estimatedDeliveryDate}
          onChange={(e) => setEstimatedDeliveryDate(e.target.value)}
        />
      </div>
    </Modal>
  );
}

function DeliveryReportStrip() {
  const { data: report, isLoading } = useDeliveryReport();

  const delivered = report?.byStatus.find((s) => s.status === 'delivered')?.count ?? 0;
  const totalShipments = report?.byStatus.reduce((sum, s) => sum + s.count, 0) ?? 0;
  const avgHours =
    report && report.averageDeliveryTimeByPartner.length > 0
      ? report.averageDeliveryTimeByPartner.reduce((sum, p) => sum + p.avgDeliveryTimeHours, 0) /
        report.averageDeliveryTimeByPartner.length
      : 0;

  const stats = [
    { label: 'Total Shipments', value: totalShipments },
    { label: 'Delivered', value: delivered },
    { label: 'Failed / RTO', value: report?.failedOrRtoCount ?? 0 },
    { label: 'Avg Delivery Time', value: `${avgHours.toFixed(1)} hrs` },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label} className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{stat.label}</p>
          {isLoading || !report ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {stat.value}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}

export default function ShipmentsPage() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('-createdAt');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const limit = 20;

  const { data, isLoading } = useAdminShipmentsList({ page, limit, sort });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Shipments</h1>
        <Can I="create" a="deliveries">
          <Button onClick={() => setShowCreate(true)}>+ Create Shipment</Button>
        </Can>
      </div>

      <DeliveryReportStrip />

      <DataTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(row) => row._id}
        totalCount={data?.meta.total ?? 0}
        page={page}
        limit={limit}
        onPageChange={setPage}
        sort={sort}
        onSortChange={setSort}
        isLoading={isLoading}
        onRowClick={(row) => setSelectedId(row._id)}
      />

      <ShipmentDetailDrawer id={selectedId} onClose={() => setSelectedId(null)} />
      <CreateShipmentModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
