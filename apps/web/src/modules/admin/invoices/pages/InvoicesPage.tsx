import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useState } from 'react';

import {
  fetchAdminInvoiceDownloadUrl,
  fetchAdminInvoices,
  regenerateInvoiceForOrder,
  type AdminInvoice,
  type InvoiceLine,
} from '../../../../api/admin-invoices.api';
import { sellerApi } from '../../../../api/sellers.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Can } from '../../../../components/common/Can';
import { EntityDrawer } from '../../../../components/common/EntityDrawer';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { DataTable } from '../../../../components/table/DataTable';
import { formatCurrency, formatDate, formatDateTime } from '../../../../utils/format';
import { toast } from '../../../../utils/toast';

const TAX_TYPE_LABEL: Record<AdminInvoice['taxType'], string> = {
  intra_state: 'CGST + SGST',
  inter_state: 'IGST',
  unknown: 'Unresolved',
};

const TAX_TYPE_TONE: Record<AdminInvoice['taxType'], 'green' | 'blue' | 'yellow'> = {
  intra_state: 'green',
  inter_state: 'blue',
  unknown: 'yellow',
};

function InvoiceLineRow({ line }: { line: InvoiceLine }) {
  return (
    <>
      <tr className="border-t border-gray-100 dark:border-night-border">
        <td className="py-1.5">
          {line.name}
          {line.bundleComponents && (
            <Badge tone="blue" className="ml-2">
              Bundle
            </Badge>
          )}
        </td>
        <td className="py-1.5 text-gray-500">{line.hsnCode || '—'}</td>
        <td className="py-1.5 text-gray-500">{line.batchNumber || '—'}</td>
        <td className="py-1.5 text-right">{line.mrp != null ? formatCurrency(line.mrp) : '—'}</td>
        <td className="py-1.5 text-right">{line.quantity}</td>
        <td className="py-1.5 text-right">{formatCurrency(line.unitPrice)}</td>
        <td className="py-1.5 text-right">{formatCurrency(line.taxableAmount)}</td>
        <td className="py-1.5 text-right">
          {line.cgstAmount ? `${formatCurrency(line.cgstAmount)} (${line.cgstRate}%)` : '—'}
        </td>
        <td className="py-1.5 text-right">
          {line.sgstAmount ? `${formatCurrency(line.sgstAmount)} (${line.sgstRate}%)` : '—'}
        </td>
        <td className="py-1.5 text-right">
          {line.igstAmount ? `${formatCurrency(line.igstAmount)} (${line.igstRate}%)` : '—'}
        </td>
        <td className="py-1.5 text-right font-medium">{formatCurrency(line.amount)}</td>
      </tr>
      {line.bundleComponents?.map((comp) => (
        <tr key={comp.productId} className="bg-gray-50 text-xs text-gray-500 dark:bg-night-elevated/40">
          <td className="py-1 pl-6" colSpan={2}>
            ↳ {comp.name} ({comp.sku})
          </td>
          <td className="py-1">{comp.hsnCode || '—'}</td>
          <td className="py-1 text-right">—</td>
          <td className="py-1 text-right">{comp.quantity}</td>
          <td className="py-1 text-right">{formatCurrency(comp.unitPriceShare)}</td>
          <td className="py-1 text-right">{formatCurrency(comp.taxableAmount)}</td>
          <td className="py-1 text-right">
            {comp.cgstAmount ? `${formatCurrency(comp.cgstAmount)} (${comp.cgstRate}%)` : '—'}
          </td>
          <td className="py-1 text-right">
            {comp.sgstAmount ? `${formatCurrency(comp.sgstAmount)} (${comp.sgstRate}%)` : '—'}
          </td>
          <td className="py-1 text-right">
            {comp.igstAmount ? `${formatCurrency(comp.igstAmount)} (${comp.igstRate}%)` : '—'}
          </td>
          <td className="py-1 text-right">—</td>
        </tr>
      ))}
    </>
  );
}

function InvoiceDetail({ invoice }: { invoice: AdminInvoice }) {
  const queryClient = useQueryClient();
  const regenerateMutation = useMutation({
    mutationFn: () => regenerateInvoiceForOrder(invoice.orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-invoices'] });
      toast.success('Invoice regenerated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
  const downloadMutation = useMutation({
    mutationFn: () => fetchAdminInvoiceDownloadUrl(invoice._id),
    onSuccess: ({ url }) => window.open(url, '_blank'),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-night-muted">Invoice Number</div>
          <div className="font-mono">{invoice.invoiceNumber}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-night-muted">Invoice Date</div>
          <div>{invoice.invoiceDate ? formatDate(invoice.invoiceDate) : '—'}</div>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-night-muted">Tax Type</div>
          <Badge tone={TAX_TYPE_TONE[invoice.taxType]}>{TAX_TYPE_LABEL[invoice.taxType]}</Badge>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-night-muted">Status</div>
          <Badge tone={invoice.status === 'generated' ? 'green' : 'gray'}>{invoice.status}</Badge>
        </div>
        <div>
          <div className="text-xs font-medium text-gray-500 dark:text-night-muted">Document Storage</div>
          <div className="flex items-center gap-2">
            <Badge tone="gray">{invoice.storageProvider === 's3' ? 'S3' : 'Cloudinary'}</Badge>
            <Badge
              tone={
                invoice.documentStatus === 'available'
                  ? 'green'
                  : invoice.documentStatus === 'failed'
                    ? 'red'
                    : invoice.documentStatus === 'expired'
                      ? 'blue'
                      : 'yellow'
              }
            >
              {invoice.documentStatus ?? 'available'}
            </Badge>
          </div>
          {invoice.documentStatus === 'expired' && (
            <p className="mt-1 text-xs text-gray-500 dark:text-night-muted">
              The stored PDF passed its retention window — it will be regenerated automatically from the
              original order data on the next download.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-md border border-gray-200 p-3 dark:border-night-border">
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-night-text">Seller</h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-night-muted">
          <div>Legal Name: {invoice.sellerNameSnapshot || '—'}</div>
          <div>GSTIN: {invoice.sellerGstinSnapshot || '—'}</div>
          <div>Address: {invoice.sellerAddressSnapshot || '—'}</div>
          <div>Drug License: {invoice.sellerDrugLicenseSnapshot || '—'}</div>
        </div>
      </div>

      <div className="rounded-md border border-gray-200 p-3 dark:border-night-border">
        <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-night-text">
          Warehouse &amp; Jurisdiction
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-night-muted">
          <div>Warehouse: {invoice.warehouseNameSnapshot || '—'}</div>
          <div>Warehouse GSTIN: {invoice.warehouseGstinSnapshot || '—'}</div>
          <div>Warehouse State Code: {invoice.warehouseStateCodeSnapshot || '—'}</div>
          <div>Customer Shipping State: {invoice.customerShippingStateSnapshot || '—'}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-night-border">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead>
            <tr className="text-gray-500">
              <th className="py-1.5 font-medium">Item</th>
              <th className="py-1.5 font-medium">HSN</th>
              <th className="py-1.5 font-medium">Batch</th>
              <th className="py-1.5 text-right font-medium">MRP</th>
              <th className="py-1.5 text-right font-medium">Qty</th>
              <th className="py-1.5 text-right font-medium">Unit Price</th>
              <th className="py-1.5 text-right font-medium">Taxable</th>
              <th className="py-1.5 text-right font-medium">CGST</th>
              <th className="py-1.5 text-right font-medium">SGST</th>
              <th className="py-1.5 text-right font-medium">IGST</th>
              <th className="py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((line, i) => (
              <InvoiceLineRow key={i} line={line} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="ml-auto flex w-64 flex-col gap-1 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-500">Subtotal</span>
          <span>{formatCurrency(invoice.totals.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">CGST</span>
          <span>{formatCurrency(invoice.gstBreakup.cgst)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">SGST</span>
          <span>{formatCurrency(invoice.gstBreakup.sgst)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">IGST</span>
          <span>{formatCurrency(invoice.gstBreakup.igst)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Shipping</span>
          <span>{formatCurrency(invoice.totals.shipping)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Discount</span>
          <span>-{formatCurrency(invoice.totals.discount)}</span>
        </div>
        {invoice.roundOffAmount !== 0 && (
          <div className="flex justify-between">
            <span className="text-gray-500">Round Off</span>
            <span>{formatCurrency(invoice.roundOffAmount)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-gray-200 pt-1 text-sm font-semibold dark:border-night-border">
          <span>Final Total</span>
          <span>{formatCurrency(invoice.finalAmount || invoice.totals.grandTotal)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {invoice.pdfUrl && (
          <Button
            type="button"
            variant="outline"
            isLoading={downloadMutation.isPending}
            onClick={() => downloadMutation.mutate()}
          >
            Download PDF
          </Button>
        )}
        <Can I="update" a="invoices">
          <Button type="button" isLoading={regenerateMutation.isPending} onClick={() => regenerateMutation.mutate()}>
            Regenerate PDF
          </Button>
        </Can>
      </div>

      <p className="text-xs text-gray-400">
        Tax/legal fields shown above were frozen at generation time and are never recalculated by a
        later product/seller edit — regenerating only re-renders the PDF from this same data.
      </p>
    </div>
  );
}

export default function AdminInvoicesPage() {
  const [page, setPage] = useState(1);
  const limit = 20;
  const [sellerId, setSellerId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState<AdminInvoice | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { data: sellersResult } = useQuery({
    queryKey: ['sellers', 'list', 'for-invoice-filter'],
    queryFn: () => sellerApi.list({ page: 1, limit: 100 }),
  });

  const filter: Record<string, string> = {};
  if (sellerId) filter.sellerId = sellerId;
  if (dateFrom) filter.dateFrom = dateFrom;
  if (dateTo) filter.dateTo = dateTo;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-invoices', page, filter],
    queryFn: () => fetchAdminInvoices({ page, limit, filter }),
    placeholderData: (prev) => prev,
  });

  const columns: ColumnDef<AdminInvoice, unknown>[] = [
    { accessorKey: 'invoiceNumber', header: 'Invoice #', enableSorting: false },
    {
      id: 'seller',
      header: 'Seller',
      enableSorting: false,
      cell: ({ row }) => row.original.sellerNameSnapshot || '—',
    },
    {
      id: 'taxType',
      header: 'Tax Type',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge tone={TAX_TYPE_TONE[row.original.taxType]}>{TAX_TYPE_LABEL[row.original.taxType]}</Badge>
      ),
    },
    {
      accessorKey: 'invoiceDate',
      header: 'Date',
      cell: ({ row }) => (row.original.invoiceDate ? formatDateTime(row.original.invoiceDate) : '—'),
    },
    {
      id: 'amount',
      header: 'Amount',
      enableSorting: false,
      cell: ({ row }) => formatCurrency(row.original.finalAmount || row.original.totals.grandTotal),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      enableSorting: false,
      cell: ({ row }) => (
        <Badge tone={row.original.status === 'generated' ? 'green' : 'gray'}>{row.original.status}</Badge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-night-text">Invoices</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Select
          label="Seller"
          value={sellerId}
          onChange={(e) => {
            setPage(1);
            setSellerId(e.target.value);
          }}
          options={[
            { label: 'All sellers', value: '' },
            ...(sellersResult?.items ?? []).map((s) => ({ label: s.legalName, value: s._id })),
          ]}
        />
        <Input
          label="From"
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setPage(1);
            setDateFrom(e.target.value);
          }}
        />
        <Input
          label="To"
          type="date"
          value={dateTo}
          onChange={(e) => {
            setPage(1);
            setDateTo(e.target.value);
          }}
        />
      </div>

      <DataTable
        data={data?.items ?? []}
        columns={columns}
        getRowId={(row) => row._id}
        totalCount={data?.meta.total ?? 0}
        page={page}
        limit={limit}
        onPageChange={setPage}
        isLoading={isLoading}
        onRowClick={(row) => {
          setSelected(row);
          setIsDrawerOpen(true);
        }}
      />

      <EntityDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={selected ? `Invoice ${selected.invoiceNumber}` : 'Invoice'}
        resource="invoices"
        resourceId={selected?._id ?? null}
        meta={
          selected
            ? {
                createdAt: selected.createdAt,
                createdBy: selected.createdBy ?? undefined,
                updatedBy: selected.updatedBy ?? undefined,
              }
            : undefined
        }
        general={selected ? <InvoiceDetail invoice={selected} /> : null}
      />
    </div>
  );
}
