import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { warehouseApi, type Warehouse } from '../../../../api/inventory.api';
import { sellerApi } from '../../../../api/sellers.api';
import { Button } from '../../../../components/common/Button';
import { Select } from '../../../../components/common/Select';
import { Textarea } from '../../../../components/common/Textarea';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { toast } from '../../../../utils/toast';
import { warehouseHooks } from '../hooks/useWarehouses';

/**
 * The generic edit form's `sellerId` field is a no-op when EDITING an
 * existing warehouse — the backend deliberately strips `sellerId` from
 * `PATCH /warehouses/:id` (see warehouse.validator.ts's
 * `updateWarehouseSchema`) so ownership never changes silently via a routine
 * field edit (Prompt 11 Part 4). This panel is the actual, audited way to
 * reassign a warehouse's seller — it calls the dedicated
 * `PATCH /warehouses/:id/transfer-seller` endpoint and requires a reason.
 */
function TransferSellerPanel({ warehouse }: { warehouse: Warehouse }) {
  const queryClient = useQueryClient();
  const [sellerId, setSellerId] = useState('');
  const [reason, setReason] = useState('');

  const { data: sellersPage } = useQuery({
    queryKey: ['sellers', 'list', 'for-transfer-panel'],
    queryFn: () => sellerApi.list({ page: 1, limit: 100 }),
  });
  const currentSeller = sellersPage?.items.find((s) => s._id === warehouse.sellerId);
  const otherSellers = (sellersPage?.items ?? []).filter(
    (s) => s.enabled && s._id !== warehouse.sellerId,
  );

  const transferMutation = useMutation({
    mutationFn: () => warehouseApi.transferSeller(warehouse._id, sellerId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses', 'detail'] });
      toast.success('Warehouse transferred to the new seller');
      setSellerId('');
      setReason('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <div className="text-xs font-medium text-gray-500 dark:text-gray-400">Current Seller</div>
        <div className="text-gray-900 dark:text-gray-100">
          {currentSeller?.legalName ?? (warehouse.sellerId ? warehouse.sellerId : 'Unassigned')}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-gray-200 pt-3 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Transfer Ownership</h3>
        <Select
          label="New Seller"
          value={sellerId}
          onChange={(e) => setSellerId(e.target.value)}
          placeholder="Select a seller…"
          options={otherSellers.map((s) => ({ label: s.legalName, value: s._id }))}
        />
        <Textarea
          label="Reason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is this warehouse changing ownership?"
        />
        <Button
          type="button"
          isLoading={transferMutation.isPending}
          disabled={!sellerId || reason.trim().length < 3}
          onClick={() => transferMutation.mutate()}
        >
          Transfer
        </Button>
      </div>
    </div>
  );
}

export default function WarehousesPage() {
  // Seller options are dynamic (admin-managed data, not a fixed enum) — fetched
  // here rather than baked into a static `fields` array, same idea as any other
  // FK dropdown would need. Only enabled sellers are offered for NEW warehouse
  // assignment (a disabled seller is rejected server-side anyway — see
  // warehouse.service.ts's assertSellerCanReceiveWarehouse — this just avoids
  // presenting a choice that would fail).
  const { data: sellersPage } = useQuery({
    queryKey: ['sellers', 'list', 'for-warehouse-form'],
    queryFn: () => sellerApi.list({ page: 1, limit: 100 }),
  });
  const sellerOptions = (sellersPage?.items ?? [])
    .filter((s) => s.enabled)
    .map((s) => ({ label: `${s.legalName} (${s.gstin})`, value: s._id }));

  const fields: ConfigField[] = [
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'code', label: 'Code', type: 'text' },
    {
      name: 'sellerId',
      label: 'Seller (set on create — use "Transfer Ownership" in Related to reassign)',
      type: 'select',
      options: sellerOptions,
      showInTable: true,
      formatCell: (v) => {
        const seller = sellersPage?.items.find((s) => s._id === v);
        return seller?.legalName ?? '—';
      },
    },
    { name: 'address', label: 'Address', type: 'text', optional: true },
    { name: 'city', label: 'City', type: 'text', optional: true },
    { name: 'state', label: 'State', type: 'text', optional: true },
    { name: 'pincode', label: 'Pincode', type: 'text', optional: true },
    { name: 'gstin', label: 'GSTIN', type: 'text', optional: true },
    { name: 'stateCode', label: 'GST State Code', type: 'text', optional: true },
    {
      name: 'contactPhone',
      label: 'Contact Phone (Shiprocket pickup)',
      type: 'text',
      optional: true,
      showInTable: false,
    },
    {
      name: 'contactEmail',
      label: 'Contact Email (Shiprocket pickup)',
      type: 'text',
      optional: true,
      showInTable: false,
    },
    { name: 'capacity', label: 'Capacity', type: 'number', optional: true },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      optional: true,
      defaultValue: 'operational',
      options: [
        { label: 'Operational', value: 'operational' },
        { label: 'Maintenance', value: 'maintenance' },
        { label: 'Closed', value: 'closed' },
      ],
      showInTable: true,
    },
  ];

  return (
    <ConfigEntityPage<Warehouse>
      title="Warehouses"
      resource="warehouses"
      hooks={warehouseHooks}
      fields={fields}
      api={warehouseApi}
      renderRelated={(warehouse) => <TransferSellerPanel warehouse={warehouse} />}
    />
  );
}
