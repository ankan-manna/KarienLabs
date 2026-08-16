import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import {
  fetchCustomerInsights,
  fetchDashboardSnapshot,
  fetchDistributorEnquirySummary,
  fetchLowStockAlerts,
  fetchRevenueTrend,
  fetchTopMedicines,
  fetchTopSuppliers,
} from '../../../../api/admin-analytics.api';
import { exportReportExcel, exportReportPdf } from '../../../../api/admin-reports.api';
import { warehouseApi } from '../../../../api/inventory.api';
import { Badge } from '../../../../components/common/Badge';
import { Button } from '../../../../components/common/Button';
import { Card } from '../../../../components/common/Card';
import { EmptyState } from '../../../../components/common/EmptyState';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { SkeletonRows } from '../../../../components/common/Skeleton';
import { useChartTheme } from '../../../../hooks/useChartTheme';
import { downloadBlob } from '../../../../utils/downloadBlob';
import { formatCurrency } from '../../../../utils/format';
import { toast } from '../../../../utils/toast';

/** Prompt 34 Part 40 — human-readable labels for DISTRIBUTOR_ENQUIRY_STATUS values, display-only (never sent back to the API). */
const DISTRIBUTOR_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  in_review: 'In Review',
  contacted: 'Contacted',
  negotiating: 'Negotiating',
  quoted: 'Quoted',
  converted: 'Converted',
  closed: 'Closed',
  rejected: 'Rejected',
};

const KPI_CARDS: { key: keyof import('../../../../api/admin-analytics.api').DashboardSnapshot; label: string; format: (v: number) => string }[] = [
  { key: 'todaysRevenue', label: "Today's Revenue", format: formatCurrency },
  { key: 'monthsRevenue', label: "This Month's Revenue", format: formatCurrency },
  { key: 'totalOrders', label: 'Total Orders', format: String },
  { key: 'monthOrders', label: "This Month's Orders", format: String },
  { key: 'totalCustomers', label: 'Total Customers', format: String },
  { key: 'lowStockCount', label: 'Low Stock Items', format: String },
  { key: 'nearExpiryCount', label: 'Near-Expiry Items', format: String },
  { key: 'pendingPurchaseRequestCount', label: 'Pending Purchase Requests', format: String },
  { key: 'pendingReturnCount', label: 'Pending Returns', format: String },
];

function useDateRange() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  return { from, to, setFrom, setTo };
}

/** Live-aggregation Analytics dashboard — a single scrollable page, distinct from the tabbed Reports hub. */
export default function AnalyticsPage() {
  const { from, to, setFrom, setTo } = useDateRange();
  const [period, setPeriod] = useState<'daily' | 'monthly'>('daily');
  const { tooltipContentStyle, tooltipLabelStyle, tooltipItemStyle } = useChartTheme();

  const { data: snapshot, isLoading: snapshotLoading } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: fetchDashboardSnapshot,
  });

  const { data: revenueTrend, isLoading: trendLoading } = useQuery({
    queryKey: ['analytics', 'revenue-trend', period, from, to],
    queryFn: () => fetchRevenueTrend({ from: from || undefined, to: to || undefined }, period),
  });

  const { data: topMedicines, isLoading: medicinesLoading } = useQuery({
    queryKey: ['analytics', 'top-medicines', from, to],
    queryFn: () => fetchTopMedicines({ from: from || undefined, to: to || undefined }),
  });

  const { data: topSuppliers, isLoading: suppliersLoading } = useQuery({
    queryKey: ['analytics', 'top-suppliers', from, to],
    queryFn: () => fetchTopSuppliers({ from: from || undefined, to: to || undefined }),
  });

  const { data: customerInsights, isLoading: insightsLoading } = useQuery({
    queryKey: ['analytics', 'customer-insights'],
    queryFn: fetchCustomerInsights,
  });

  const { data: lowStock, isLoading: lowStockLoading } = useQuery({
    queryKey: ['analytics', 'low-stock'],
    queryFn: fetchLowStockAlerts,
  });

  const { data: distributorSummary, isLoading: distributorLoading } = useQuery({
    queryKey: ['analytics', 'distributor-enquiries', from, to],
    queryFn: () => fetchDistributorEnquirySummary({ from: from || undefined, to: to || undefined }),
  });

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses', 'list', { page: 1, limit: 100 }],
    queryFn: () => warehouseApi.list({ page: 1, limit: 100 }),
  });

  const warehouseNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of warehouses?.items ?? []) map.set(w._id, w.name);
    return map;
  }, [warehouses]);

  const range = { from: from || undefined, to: to || undefined };

  /** Prompt 34 Part 29 — reuses the EXISTING /admin/reports/sales export endpoint; no new backend code for this button. */
  async function handleExportSales(format: 'excel' | 'pdf') {
    try {
      const blob =
        format === 'excel'
          ? await exportReportExcel('/admin/reports/sales', range)
          : await exportReportPdf('/admin/reports/sales', range);
      downloadBlob(blob, `sales-report-${Date.now()}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch {
      toast.error('Export failed');
    }
  }

  async function handleExportDistributor(format: 'excel' | 'pdf') {
    try {
      const blob =
        format === 'excel'
          ? await exportReportExcel('/admin/reports/distributor-enquiries', range)
          : await exportReportPdf('/admin/reports/distributor-enquiries', range);
      downloadBlob(blob, `distributor-enquiry-report-${Date.now()}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch {
      toast.error('Export failed');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Analytics</h1>

      {/* KPI stat cards */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Overview
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {KPI_CARDS.map((stat) => (
            <Card key={stat.key} className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{stat.label}</p>
              {snapshotLoading || !snapshot ? (
                <div className="mt-2 h-7 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
              ) : (
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {stat.format(snapshot[stat.key])}
                </p>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* Revenue trend */}
      <section>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Revenue Trend</h2>
          <div className="flex flex-wrap items-end gap-3">
            <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            <Select
              label="Period"
              value={period}
              onChange={(e) => setPeriod(e.target.value as 'daily' | 'monthly')}
              options={[
                { label: 'Daily', value: 'daily' },
                { label: 'Monthly', value: 'monthly' },
              ]}
            />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleExportSales('excel')}>
                Export Excel
              </Button>
              <Button variant="outline" onClick={() => handleExportSales('pdf')}>
                Export PDF
              </Button>
            </div>
          </div>
        </div>
        <Card className="p-4">
          {trendLoading ? (
            <SkeletonRows rows={4} columns={3} />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-100 dark:stroke-gray-800" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={tooltipContentStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Bar dataKey="revenue" fill="#FF8000" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </section>

      {/* Top medicines & top suppliers */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Top 10 Medicines (by Revenue)
          </h3>
          {medicinesLoading ? (
            <SkeletonRows rows={6} columns={3} />
          ) : !topMedicines?.length ? (
            <EmptyState title="No sales in this range" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {['Product', 'SKU', 'Units Sold', 'Revenue'].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topMedicines.map((m) => (
                    <tr key={m.productId} className="border-t border-gray-100 dark:border-gray-800/60">
                      <td className="px-3 py-2">{m.productName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{m.sku}</td>
                      <td className="px-3 py-2">{m.unitsSold}</td>
                      <td className="px-3 py-2 font-medium">{formatCurrency(m.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Top 10 Suppliers (by PO Value)
          </h3>
          {suppliersLoading ? (
            <SkeletonRows rows={6} columns={3} />
          ) : !topSuppliers?.length ? (
            <EmptyState title="No purchase orders in this range" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {['Supplier', 'Orders', 'Total Value'].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topSuppliers.map((s) => (
                    <tr key={s.supplierId} className="border-t border-gray-100 dark:border-gray-800/60">
                      <td className="px-3 py-2">{s.supplierName}</td>
                      <td className="px-3 py-2">{s.totalOrders}</td>
                      <td className="px-3 py-2 font-medium">{formatCurrency(s.totalValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* Customer insights */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Customer Insights
        </h2>
        <Card className="p-4">
          {insightsLoading || !customerInsights ? (
            <SkeletonRows rows={6} columns={3} />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    New Customers This Month
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {customerInsights.newCustomersThisMonth}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Repeat Purchase Rate
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {customerInsights.repeatPurchaseRate.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Total Customers
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {customerInsights.totalCustomers}
                  </p>
                </div>
              </div>
              {!customerInsights.topCustomers.length ? (
                <EmptyState title="No customer spend yet" />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        {['Customer', 'Email', 'Lifetime Spend'].map((h) => (
                          <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {customerInsights.topCustomers.map((c) => (
                        <tr key={c.customerId} className="border-t border-gray-100 dark:border-gray-800/60">
                          <td className="px-3 py-2">{c.name}</td>
                          <td className="px-3 py-2 text-gray-500">{c.email}</td>
                          <td className="px-3 py-2 font-medium">{formatCurrency(c.totalSpent)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      </section>

      {/* Distributor / Bulk Purchase enquiries */}
      <section>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Distributor Enquiries
          </h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleExportDistributor('excel')}>
              Export Excel
            </Button>
            <Button variant="outline" onClick={() => handleExportDistributor('pdf')}>
              Export PDF
            </Button>
          </div>
        </div>
        <Card className="p-4">
          {distributorLoading ? (
            <SkeletonRows rows={6} columns={3} />
          ) : !distributorSummary || distributorSummary.totalEnquiries === 0 ? (
            <EmptyState title="No distributor enquiries in this range" />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Total Enquiries
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {distributorSummary.totalEnquiries}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Conversion Rate
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {distributorSummary.conversionRatePercent.toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Converted
                  </p>
                  <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                    {distributorSummary.statusBreakdown.converted ?? 0}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {Object.entries(distributorSummary.statusBreakdown).map(([status, count]) => (
                  <Badge key={status} tone={status === 'converted' ? 'green' : status === 'rejected' ? 'red' : 'gray'}>
                    {DISTRIBUTOR_STATUS_LABELS[status] ?? status}: {count}
                  </Badge>
                ))}
              </div>

              {!distributorSummary.topRequestedSkus.length ? (
                <EmptyState title="No requested products in this range" />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
                  <table className="w-full min-w-[420px] text-left text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                      <tr>
                        {['SKU', 'Product', 'Requested Qty', 'Enquiries'].map((h) => (
                          <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {distributorSummary.topRequestedSkus.map((row) => (
                        <tr key={row.sku} className="border-t border-gray-100 dark:border-gray-800/60">
                          <td className="px-3 py-2 font-mono text-xs">{row.sku}</td>
                          <td className="px-3 py-2">{row.productName}</td>
                          <td className="px-3 py-2">{row.totalRequestedQuantity}</td>
                          <td className="px-3 py-2">{row.enquiryCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </Card>
      </section>

      {/* Low stock alerts */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Low Stock Alerts
        </h2>
        <Card className="p-4">
          {lowStockLoading ? (
            <SkeletonRows rows={6} columns={4} />
          ) : !lowStock?.length ? (
            <EmptyState title="No low-stock items" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    {['Product', 'Warehouse', 'Qty Available', 'Reorder Level'].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-gray-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lowStock.map((row) => (
                    <tr
                      key={`${row.productId}-${row.warehouseId}`}
                      className="border-t border-gray-100 dark:border-gray-800/60"
                    >
                      <td className="px-3 py-2">{row.productName}</td>
                      <td className="px-3 py-2">{warehouseNameById.get(row.warehouseId) ?? row.warehouseId}</td>
                      <td className="px-3 py-2">{row.totalAvailable}</td>
                      <td className="px-3 py-2">{row.reorderLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}
