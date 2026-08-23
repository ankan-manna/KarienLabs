import { useQuery } from '@tanstack/react-query';

import { fetchSellerSummary, sellerApi, type Seller } from '../../../../api/sellers.api';
import { Badge } from '../../../../components/common/Badge';
import { Skeleton } from '../../../../components/common/Skeleton';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { sellerHooks } from '../hooks/useSellers';

const fields: ConfigField[] = [
  { name: 'legalName', label: 'Legal Name', type: 'text', showInTable: true },
  { name: 'gstin', label: 'GSTIN', type: 'text', showInTable: true },
  { name: 'drugLicenseNumber', label: 'Drug License Number', type: 'text', showInTable: true },
  { name: 'address', label: 'Registered Address', type: 'textarea', optional: true, showInTable: false },
  {
    name: 'invoiceCode',
    label: 'Invoice Code',
    type: 'text',
    optional: true,
    showInTable: false,
  },
  {
    name: 'enabled',
    label: 'Enabled',
    type: 'boolean',
    defaultValue: true,
    showInTable: true,
    formatCell: (v) => (v ? 'Enabled' : 'Disabled'),
  },
];

/** Seller detail view's "Related Information" tab — Warehouses / Orders / Invoices / Inventory summary ( 11 Part 11). Read-only rollup via GET /sellers/:id/summary. */
function SellerRelatedInfo({ seller }: { seller: Seller }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sellers', 'summary', seller._id],
    queryFn: () => fetchSellerSummary(seller._id),
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium text-gray-700 dark:text-gray-300">Status</span>
        <Badge tone={seller.enabled ? 'green' : 'gray'}>{seller.enabled ? 'Enabled' : 'Disabled'}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile label="Warehouses" value={data.warehouseCount} />
        <SummaryTile label="Orders" value={data.orders.count} sub={`₹${data.orders.totalValue.toFixed(2)}`} />
        <SummaryTile
          label="Invoices"
          value={data.invoices.count}
          sub={`₹${data.invoices.totalValue.toFixed(2)}`}
        />
        <SummaryTile
          label="Inventory Batches"
          value={data.inventory.batchCount}
          sub={`${data.inventory.totalUnits} units`}
        />
      </div>

      <p className="text-xs text-gray-400">
        Warehouses can be assigned to this seller from the Warehouses page — each warehouse belongs to
        exactly one seller.
      </p>
    </div>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-md border border-gray-200 p-3 dark:border-gray-800">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

export default function SellersPage() {
  return (
    <ConfigEntityPage<Seller>
      title="Sellers"
      resource="sellers"
      hooks={sellerHooks}
      fields={fields}
      api={sellerApi}
      hasActiveToggle={false}
      renderRelated={(seller) => <SellerRelatedInfo seller={seller} />}
    />
  );
}
