import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  exportReportExcel,
  exportReportPdf,
  fetchCategoryReport,
  fetchCouponReport,
  fetchCustomerReport,
  fetchExpiryReport,
  fetchGstReport,
  fetchInventoryReport,
  fetchInvoiceReport,
  fetchOrderReport,
  fetchPaymentReport,
  fetchPrescriptionReport,
  fetchPurchaseReport,
  fetchRefundReport,
  fetchReturnReport,
  fetchSalesReport,
  fetchShipmentReport,
  fetchSupplierReport,
  fetchWarehouseReport,
} from '../../../../api/admin-reports.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Card } from '../../../../components/common/Card';
import { Input } from '../../../../components/common/Input';
import { SkeletonRows } from '../../../../components/common/Skeleton';
import { Tabs } from '../../../../components/common/Tabs';
import { useChartTheme } from '../../../../hooks/useChartTheme';
import { downloadBlob } from '../../../../utils/downloadBlob';
import { formatCurrency } from '../../../../utils/format';
import { toast } from '../../../../utils/toast';

function useDateRange() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return { from, to, setFrom, setTo };
}

function DateRangeBar({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
}) {
  return (
    <div className="flex items-end gap-3">
      <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
    </div>
  );
}

function SalesReportTab() {
  const { from, to, setFrom, setTo } = useDateRange();
  const { gridClassName, tooltipContentStyle, tooltipLabelStyle, tooltipItemStyle } =
    useChartTheme();
  const { data, isLoading } = useQuery({
    queryKey: ['report-sales', from, to],
    queryFn: () => fetchSalesReport({ from: from || undefined, to: to || undefined }),
  });

  async function handleExport() {
    try {
      const blob = await exportReportExcel('/admin/reports/sales', { from, to });
      downloadBlob(blob, `sales-report-${Date.now()}.xlsx`);
    } catch {
      toast.error('Export failed');
    }
  }

  async function handleExportPdf() {
    try {
      const blob = await exportReportPdf('/admin/reports/sales', { from, to });
      downloadBlob(blob, `sales-report-${Date.now()}.pdf`);
    } catch {
      toast.error('Export failed');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}>
            Export Excel
          </Button>
          <Button variant="outline" onClick={handleExportPdf}>
            Export PDF
          </Button>
        </div>
      </div>
      {isLoading ? (
        <SkeletonRows rows={6} columns={6} />
      ) : (
        <>
          <Card className="p-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data ?? []}>
                <CartesianGrid strokeDasharray="3 3" className={gridClassName} />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Bar dataKey="revenue" fill="#FF8000" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  {['Date', 'Orders', 'Subtotal', 'GST', 'Discount', 'Shipping', 'Revenue'].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((row) => (
                  <tr key={row.date} className="border-t border-gray-100 dark:border-gray-800/60">
                    <td className="px-3 py-2">{row.date}</td>
                    <td className="px-3 py-2">{row.orders}</td>
                    <td className="px-3 py-2">{formatCurrency(row.subtotal)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.gst)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.discount)}</td>
                    <td className="px-3 py-2">{formatCurrency(row.shipping)}</td>
                    <td className="px-3 py-2 font-medium">{formatCurrency(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function InventoryReportTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['report-inventory'],
    queryFn: fetchInventoryReport,
  });
  if (isLoading || !data) return <SkeletonRows rows={6} columns={3} />;

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Stock Valuation by Warehouse
        </h3>
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Warehouse</th>
                <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Quantity</th>
                <th className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">Value</th>
              </tr>
            </thead>
            <tbody>
              {data.valuation.map((v) => (
                <tr key={v.warehouseId} className="border-t border-gray-100 dark:border-gray-800/60">
                  <td className="px-3 py-2">{v.warehouseName}</td>
                  <td className="px-3 py-2">{v.totalQuantity}</td>
                  <td className="px-3 py-2">{formatCurrency(v.totalValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Low Stock</h3>
          <p className="text-2xl font-semibold">{data.lowStock.length}</p>
        </Card>
        <Card className="p-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Near Expiry</h3>
          <p className="text-2xl font-semibold">{data.nearExpiry.length}</p>
        </Card>
      </section>
    </div>
  );
}

function GstReportTab() {
  const { from, to, setFrom, setTo } = useDateRange();
  const { data, isLoading } = useQuery({
    queryKey: ['report-gst', from, to],
    queryFn: () => fetchGstReport({ from: from || undefined, to: to || undefined }),
  });

  async function handleExportExcel() {
    try {
      const blob = await exportReportExcel('/admin/reports/gst', { from, to });
      downloadBlob(blob, `gst-report-${Date.now()}.xlsx`);
    } catch {
      toast.error('Export failed');
    }
  }

  async function handleExportPdf() {
    try {
      const blob = await exportReportPdf('/admin/reports/gst', { from, to });
      downloadBlob(blob, `gst-report-${Date.now()}.pdf`);
    } catch {
      toast.error('Export failed');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportExcel}>
            Export Excel
          </Button>
          <Button variant="outline" onClick={handleExportPdf}>
            Export PDF
          </Button>
        </div>
      </div>
      {isLoading ? (
        <SkeletonRows rows={4} columns={4} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                {['GST Rate', 'Taxable Amount', 'GST Collected', 'Units Sold'].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.gstRate} className="border-t border-gray-100 dark:border-gray-800/60">
                  <td className="px-3 py-2">{row.gstRate}%</td>
                  <td className="px-3 py-2">{formatCurrency(row.taxableAmount)}</td>
                  <td className="px-3 py-2">{formatCurrency(row.gstCollected)}</td>
                  <td className="px-3 py-2">{row.unitsSold}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PaymentReportTab() {
  const { data, isLoading } = useQuery({ queryKey: ['report-payments'], queryFn: () => fetchPaymentReport({}) });
  if (isLoading) return <SkeletonRows rows={4} columns={3} />;
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {(data ?? []).map((row) => (
        <Card key={row.status} className="p-4">
          <Badge tone="gray">{row.status}</Badge>
          <p className="mt-2 text-2xl font-semibold">{row.count}</p>
          <p className="text-sm text-gray-500">{formatCurrency(row.amountInPaise / 100)}</p>
        </Card>
      ))}
    </div>
  );
}

function CustomerReportTab() {
  const { data, isLoading } = useQuery({ queryKey: ['report-customers'], queryFn: () => fetchCustomerReport({}) });
  if (isLoading || !data) return <SkeletonRows rows={3} columns={3} />;
  return (
    <div className="grid grid-cols-3 gap-4">
      <Card className="p-4">
        <p className="text-sm text-gray-500">New Customers</p>
        <p className="text-2xl font-semibold">{data.newCustomers}</p>
      </Card>
      <Card className="p-4">
        <p className="text-sm text-gray-500">Active Customers</p>
        <p className="text-2xl font-semibold">{data.activeCustomers}</p>
      </Card>
      <Card className="p-4">
        <p className="text-sm text-gray-500">Revenue from Customers</p>
        <p className="text-2xl font-semibold">{formatCurrency(data.totalRevenue)}</p>
      </Card>
    </div>
  );
}

function CouponReportTab() {
  const { data, isLoading } = useQuery({ queryKey: ['report-coupons'], queryFn: fetchCouponReport });
  if (isLoading) return <SkeletonRows rows={5} columns={5} />;
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            {['Code', 'Type', 'Value', 'Used', 'Limit', 'Active'].map((h) => (
              <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((c) => (
            <tr key={c.code} className="border-t border-gray-100 dark:border-gray-800/60">
              <td className="px-3 py-2 font-medium">{c.code}</td>
              <td className="px-3 py-2">{c.type}</td>
              <td className="px-3 py-2">{c.value}</td>
              <td className="px-3 py-2">{c.usageCount}</td>
              <td className="px-3 py-2">{c.usageLimitGlobal ?? '∞'}</td>
              <td className="px-3 py-2">
                <Badge tone={c.isActive ? 'green' : 'gray'}>{c.isActive ? 'Active' : 'Inactive'}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBreakdownGrid({ breakdown }: { breakdown: Record<string, number> }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {Object.entries(breakdown).map(([status, count]) => (
        <Card key={status} className="p-4">
          <Badge tone="gray">{status}</Badge>
          <p className="mt-2 text-2xl font-semibold">{count}</p>
        </Card>
      ))}
    </div>
  );
}

function WarehouseReportTab() {
  const { data, isLoading } = useQuery({ queryKey: ['report-warehouses'], queryFn: fetchWarehouseReport });

  async function handleExport() {
    try {
      const blob = await exportReportExcel('/admin/reports/warehouses', {});
      downloadBlob(blob, `warehouse-report-${Date.now()}.xlsx`);
    } catch {
      toast.error('Export failed');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="outline" onClick={handleExport}>
          Export Excel
        </Button>
      </div>
      {isLoading ? (
        <SkeletonRows rows={5} columns={6} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                {['Warehouse', 'Code', 'Batches', 'Stock Value', 'Low Stock', 'Near Expiry'].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.warehouseId} className="border-t border-gray-100 dark:border-gray-800/60">
                  <td className="px-3 py-2 font-medium">{row.warehouseName}</td>
                  <td className="px-3 py-2">{row.warehouseCode}</td>
                  <td className="px-3 py-2">{row.totalBatches}</td>
                  <td className="px-3 py-2">{formatCurrency(row.totalStockValue)}</td>
                  <td className="px-3 py-2">
                    <Badge tone={row.lowStockCount > 0 ? 'yellow' : 'gray'}>{row.lowStockCount}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge tone={row.nearExpiryCount > 0 ? 'red' : 'gray'}>{row.nearExpiryCount}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PurchaseReportTab() {
  const { from, to, setFrom, setTo } = useDateRange();
  const { data, isLoading } = useQuery({
    queryKey: ['report-purchases', from, to],
    queryFn: () => fetchPurchaseReport({ from: from || undefined, to: to || undefined }),
  });

  return (
    <div className="flex flex-col gap-4">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {isLoading || !data ? (
        <SkeletonRows rows={6} columns={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total POs</p>
              <p className="text-2xl font-semibold">{data.totalOrders}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total Value</p>
              <p className="text-2xl font-semibold">{formatCurrency(data.totalValue)}</p>
            </Card>
          </div>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Status Breakdown</h3>
            <StatusBreakdownGrid breakdown={data.statusBreakdown} />
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Top 10 Products by Quantity Purchased
            </h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {['Product', 'SKU', 'Quantity Purchased'].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((p) => (
                    <tr key={p.productId} className="border-t border-gray-100 dark:border-gray-800/60">
                      <td className="px-3 py-2 font-medium">{p.productName}</td>
                      <td className="px-3 py-2">{p.sku}</td>
                      <td className="px-3 py-2">{p.quantityPurchased}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function SupplierReportTab() {
  const { from, to, setFrom, setTo } = useDateRange();
  const { data, isLoading } = useQuery({
    queryKey: ['report-suppliers', from, to],
    queryFn: () => fetchSupplierReport({ from: from || undefined, to: to || undefined }),
  });

  async function handleExport() {
    try {
      const blob = await exportReportExcel('/admin/reports/suppliers', { from, to });
      downloadBlob(blob, `supplier-report-${Date.now()}.xlsx`);
    } catch {
      toast.error('Export failed');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <Button variant="outline" onClick={handleExport}>
          Export Excel
        </Button>
      </div>
      {isLoading ? (
        <SkeletonRows rows={5} columns={4} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                {['Supplier', 'Total Orders', 'Total Value', 'Performance Rating'].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.supplierId} className="border-t border-gray-100 dark:border-gray-800/60">
                  <td className="px-3 py-2 font-medium">{row.supplierName}</td>
                  <td className="px-3 py-2">{row.totalOrders}</td>
                  <td className="px-3 py-2">{formatCurrency(row.totalValue)}</td>
                  <td className="px-3 py-2">{row.performanceRating ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExpiryReportTab() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({
    queryKey: ['report-expiry', days],
    queryFn: () => fetchExpiryReport(days),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="w-40">
        <Input
          label="Near-Expiry Window (days)"
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(Number(e.target.value) || 30)}
        />
      </div>
      {isLoading || !data ? (
        <SkeletonRows rows={6} columns={5} />
      ) : (
        <>
          <Card className="p-4">
            <p className="text-sm text-gray-500">Total Value at Risk</p>
            <p className="text-2xl font-semibold">{formatCurrency(data.totalValueAtRisk)}</p>
          </Card>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Expired Batches ({data.expired.length})
            </h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {['Product', 'Warehouse', 'Quantity', 'Value'].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.expired.map((row, i) => (
                    <tr
                      key={`${row.productId}-${row.warehouseId}-${i}`}
                      className="border-t border-gray-100 dark:border-gray-800/60"
                    >
                      <td className="px-3 py-2 font-medium">{row.productName}</td>
                      <td className="px-3 py-2">{row.warehouseName}</td>
                      <td className="px-3 py-2">{row.quantity}</td>
                      <td className="px-3 py-2">{formatCurrency(row.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Near-Expiry Batches ({data.nearExpiry.length})
            </h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {['Product', 'Warehouse', 'Quantity', 'Value', 'Nearest Expiry'].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.nearExpiry.map((row, i) => (
                    <tr
                      key={`${row.productId}-${row.warehouseId}-${i}`}
                      className="border-t border-gray-100 dark:border-gray-800/60"
                    >
                      <td className="px-3 py-2 font-medium">{row.productName}</td>
                      <td className="px-3 py-2">{row.warehouseName}</td>
                      <td className="px-3 py-2">{row.quantity}</td>
                      <td className="px-3 py-2">{formatCurrency(row.value)}</td>
                      <td className="px-3 py-2">
                        {row.nearestExpiry ? new Date(row.nearestExpiry).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function OrderReportTab() {
  const { from, to, setFrom, setTo } = useDateRange();
  const { gridClassName, tooltipContentStyle, tooltipLabelStyle, tooltipItemStyle } =
    useChartTheme();
  const { data, isLoading } = useQuery({
    queryKey: ['report-orders', from, to],
    queryFn: () => fetchOrderReport({ from: from || undefined, to: to || undefined }),
  });

  return (
    <div className="flex flex-col gap-4">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {isLoading || !data ? (
        <SkeletonRows rows={6} columns={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total Orders</p>
              <p className="text-2xl font-semibold">{data.totalOrders}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Average Order Value</p>
              <p className="text-2xl font-semibold">{formatCurrency(data.averageOrderValue)}</p>
            </Card>
          </div>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Status Breakdown</h3>
            <Card className="p-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={Object.entries(data.statusBreakdown).map(([status, count]) => ({ status, count }))}
                >
                  <CartesianGrid strokeDasharray="3 3" className={gridClassName} />
                  <XAxis dataKey="status" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Bar dataKey="count" fill="#FF8000" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Daily Orders & Revenue</h3>
            <Card className="p-4">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data.timeSeries}>
                  <CartesianGrid strokeDasharray="3 3" className={gridClassName} />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Bar dataKey="revenue" fill="#FF8000" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function InvoiceReportTab() {
  const { from, to, setFrom, setTo } = useDateRange();
  const { data, isLoading } = useQuery({
    queryKey: ['report-invoices', from, to],
    queryFn: () => fetchInvoiceReport({ from: from || undefined, to: to || undefined }),
  });

  return (
    <div className="flex flex-col gap-4">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {isLoading || !data ? (
        <SkeletonRows rows={4} columns={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total Invoices</p>
              <p className="text-2xl font-semibold">{data.totalInvoices}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total GST Collected</p>
              <p className="text-2xl font-semibold">{formatCurrency(data.totalGstCollected)}</p>
            </Card>
          </div>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Status Breakdown</h3>
            <StatusBreakdownGrid breakdown={data.statusBreakdown} />
          </section>
        </>
      )}
    </div>
  );
}

function RefundReportTab() {
  const { from, to, setFrom, setTo } = useDateRange();
  const { data, isLoading } = useQuery({
    queryKey: ['report-refunds', from, to],
    queryFn: () => fetchRefundReport({ from: from || undefined, to: to || undefined }),
  });

  return (
    <div className="flex flex-col gap-4">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {isLoading || !data ? (
        <SkeletonRows rows={4} columns={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total Refunds</p>
              <p className="text-2xl font-semibold">{data.totalRefunds}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total Refund Amount</p>
              <p className="text-2xl font-semibold">{formatCurrency(data.totalRefundAmount)}</p>
            </Card>
          </div>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Status Breakdown</h3>
            <StatusBreakdownGrid breakdown={data.statusBreakdown} />
          </section>
        </>
      )}
    </div>
  );
}

function ReturnReportTab() {
  const { from, to, setFrom, setTo } = useDateRange();
  const { data, isLoading } = useQuery({
    queryKey: ['report-returns', from, to],
    queryFn: () => fetchReturnReport({ from: from || undefined, to: to || undefined }),
  });

  return (
    <div className="flex flex-col gap-4">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {isLoading || !data ? (
        <SkeletonRows rows={4} columns={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total Returns</p>
              <p className="text-2xl font-semibold">{data.totalReturns}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Replacements</p>
              <p className="text-2xl font-semibold">{data.resolutionTypeBreakdown.replacement ?? 0}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Refunds (via return)</p>
              <p className="text-2xl font-semibold">{data.resolutionTypeBreakdown.refund ?? 0}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Pending Resolution</p>
              <p className="text-2xl font-semibold">{data.pendingResolutionCount}</p>
            </Card>
          </div>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Status Breakdown</h3>
            <StatusBreakdownGrid breakdown={data.statusBreakdown} />
          </section>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Top Return Reasons</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
              <table className="w-full min-w-[400px] text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {['Reason', 'Count'].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.topReasons.map((r) => (
                    <tr key={r.reason} className="border-t border-gray-100 dark:border-gray-800/60">
                      <td className="px-3 py-2 font-medium">{r.reason}</td>
                      <td className="px-3 py-2">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** Prompt 22 Part 24 — verification counts + real turnaround-time metric, never file/document contents. */
function PrescriptionReportTab() {
  const { from, to, setFrom, setTo } = useDateRange();
  const { data, isLoading } = useQuery({
    queryKey: ['report-prescriptions', from, to],
    queryFn: () => fetchPrescriptionReport({ from: from || undefined, to: to || undefined }),
  });

  return (
    <div className="flex flex-col gap-4">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {isLoading || !data ? (
        <SkeletonRows rows={4} columns={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total Prescriptions</p>
              <p className="text-2xl font-semibold">{data.totalPrescriptions}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Avg. Verification Turnaround</p>
              <p className="text-2xl font-semibold">{data.averageVerificationTurnaroundHours.toFixed(1)}h</p>
            </Card>
          </div>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Status Breakdown</h3>
            <StatusBreakdownGrid breakdown={data.statusBreakdown} />
          </section>
        </>
      )}
    </div>
  );
}

/** Prompt 22 Part 19/20 — real delivery-duration + on-time-rate metrics derived from shipment timestamps this codebase already records. */
function ShipmentReportTab() {
  const { from, to, setFrom, setTo } = useDateRange();
  const { data, isLoading } = useQuery({
    queryKey: ['report-shipments', from, to],
    queryFn: () => fetchShipmentReport({ from: from || undefined, to: to || undefined }),
  });

  return (
    <div className="flex flex-col gap-4">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {isLoading || !data ? (
        <SkeletonRows rows={4} columns={4} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Card className="p-4">
              <p className="text-sm text-gray-500">Total Shipments</p>
              <p className="text-2xl font-semibold">{data.totalShipments}</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Avg. Delivery Duration</p>
              <p className="text-2xl font-semibold">{data.averageDeliveryDurationHours.toFixed(1)}h</p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">On-Time Delivery Rate</p>
              <p className="text-2xl font-semibold">
                {data.onTimeDeliveryRatePercent === null ? '—' : `${data.onTimeDeliveryRatePercent.toFixed(1)}%`}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-sm text-gray-500">Failed / RTO</p>
              <p className="text-2xl font-semibold">{data.failedOrRtoCount}</p>
            </Card>
          </div>
          <section>
            <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Status Breakdown</h3>
            <StatusBreakdownGrid breakdown={data.statusBreakdown} />
          </section>
        </>
      )}
    </div>
  );
}

/** Prompt 22 Part 14 — category revenue/units/order-count, categoryName resolved via a live $lookup so a later category rename is reflected, never a stale copy. */
function CategoryReportTab() {
  const { from, to, setFrom, setTo } = useDateRange();
  const { data, isLoading } = useQuery({
    queryKey: ['report-categories', from, to],
    queryFn: () => fetchCategoryReport({ from: from || undefined, to: to || undefined }),
  });

  return (
    <div className="flex flex-col gap-4">
      <DateRangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {isLoading ? (
        <SkeletonRows rows={6} columns={4} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                {['Category', 'Revenue', 'Units Sold', 'Orders'].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row) => (
                <tr key={row.categoryId ?? 'uncategorized'} className="border-t border-gray-100 dark:border-gray-800/60">
                  <td className="px-3 py-2 font-medium">{row.categoryName}</td>
                  <td className="px-3 py-2">{formatCurrency(row.revenue)}</td>
                  <td className="px-3 py-2">{row.unitsSold}</td>
                  <td className="px-3 py-2">{row.orderCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Reports hub — one page, tabbed by report type, each independently date-filterable and (where it makes sense) Excel-exportable, per the Prompt 5 "Reports" spec section. */
export default function ReportsPage() {
  const [tab, setTab] = useState('sales');

  const tabs = [
    { key: 'sales', label: 'Sales', content: <SalesReportTab /> },
    { key: 'inventory', label: 'Inventory', content: <InventoryReportTab /> },
    { key: 'gst', label: 'GST', content: <GstReportTab /> },
    { key: 'payments', label: 'Payments', content: <PaymentReportTab /> },
    { key: 'customers', label: 'Customers', content: <CustomerReportTab /> },
    { key: 'coupons', label: 'Coupons', content: <CouponReportTab /> },
    { key: 'warehouses', label: 'Warehouses', content: <WarehouseReportTab /> },
    { key: 'purchases', label: 'Purchases', content: <PurchaseReportTab /> },
    { key: 'suppliers', label: 'Suppliers', content: <SupplierReportTab /> },
    { key: 'expiry', label: 'Expiry', content: <ExpiryReportTab /> },
    { key: 'orders', label: 'Orders', content: <OrderReportTab /> },
    { key: 'invoices', label: 'Invoices', content: <InvoiceReportTab /> },
    { key: 'refunds', label: 'Refunds', content: <RefundReportTab /> },
    { key: 'returns', label: 'Returns', content: <ReturnReportTab /> },
    { key: 'prescriptions', label: 'Prescriptions', content: <PrescriptionReportTab /> },
    { key: 'shipments', label: 'Shipments', content: <ShipmentReportTab /> },
    { key: 'categories', label: 'Categories', content: <CategoryReportTab /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Reports</h1>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
    </div>
  );
}
