import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { fetchDashboardStats } from '../../../../api/admin.api';
import { fetchPlatformHealth } from '../../../../api/platform-health.api';
import { Badge } from '../../../../components/common/Badge';
import { Card } from '../../../../components/common/Card';
import { EmptyState } from '../../../../components/common/EmptyState';
import { Skeleton, SkeletonRows } from '../../../../components/common/Skeleton';
import { useAuth } from '../../../../context/AuthContext';
import { useChartTheme } from '../../../../hooks/useChartTheme';
import { formatCurrency, formatDateTime } from '../../../../utils/format';

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Super Admin Dashboard's platform-operations panel — distinct from the commerce-focused Sales Summary below (spec: "Platform Health, Total Tenants, Total Platform Admins, ... Queue Status, Failed Jobs, ... Audit Summary"). */
function PlatformHealthSection() {
  const { data: health, isLoading } = useQuery({
    queryKey: ['admin', 'platform-health'],
    queryFn: fetchPlatformHealth,
  });

  const cards = health
    ? [
        {
          label: 'API / DB',
          value: (
            <div className="flex gap-1">
              <Badge tone={health.platformHealth.apiStatus === 'ok' ? 'green' : 'red'}>API</Badge>
              <Badge tone={health.platformHealth.databaseStatus === 'connected' ? 'green' : 'red'}>
                DB
              </Badge>
            </div>
          ),
        },
        { label: 'Server Uptime', value: formatUptime(health.platformHealth.serverUptimeSeconds) },
        { label: 'Platform Admins', value: health.totalPlatformAdmins },
        { label: 'Total Customers', value: health.totalCustomers },
        { label: 'Total Revenue', value: formatCurrency(health.totalRevenue) },
        { label: 'Active Sessions', value: health.activeSessions },
        {
          label: 'Failed Jobs',
          value: <Badge tone={health.failedJobs > 0 ? 'red' : 'green'}>{health.failedJobs}</Badge>,
        },
        {
          label: 'Notifications',
          value: `${health.notificationQueue.queued} queued / ${health.notificationQueue.failed} failed`,
        },
      ]
    : [];

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Platform Health
      </h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
        {(isLoading || !health ? Array.from({ length: 8 }) : cards).map((card, i) => (
          <Card key={i} className="p-4">
            {isLoading || !health ? (
              <Skeleton className="h-12 w-full" />
            ) : (
              <>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  {(card as { label: string }).label}
                </p>
                <div className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {(card as { value: ReactNode }).value}
                </div>
              </>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}

const SALES_SUMMARY_CARDS = [
  { key: 'todaysRevenue' as const, label: "Today's Revenue", format: formatCurrency },
  { key: 'todaysOrderCount' as const, label: "Today's Orders", format: String },
  { key: 'pendingOrderCount' as const, label: 'Pending Orders', format: String },
  { key: 'deliveredOrderCount' as const, label: 'Delivered Orders', format: String },
  { key: 'cancelledOrderCount' as const, label: 'Cancelled Orders', format: String },
  { key: 'refundRequestCount' as const, label: 'Refund Requests', format: String },
];

const INVENTORY_STATUS_CARDS = [
  { key: 'lowStockCount' as const, label: 'Low Stock Medicines', format: String },
  { key: 'expiringCount' as const, label: 'Expiring Medicines', format: String },
  { key: 'outOfStockCount' as const, label: 'Out of Stock Products', format: String },
  { key: 'pendingPrescriptionCount' as const, label: 'Prescriptions to Review', format: String },
];

const QUICK_ACTIONS = [
  { to: '/admin/catalog/products', label: '+ New Product' },
  { to: '/admin/orders', label: 'View Orders' },
  { to: '/admin/coupons', label: '+ New Coupon' },
  { to: '/admin/reports', label: 'View Reports' },
];

export default function DashboardPage() {
  const { isSuperAdmin } = useAuth();
  const { gridClassName, tooltipContentStyle, tooltipLabelStyle, tooltipItemStyle } = useChartTheme();
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: fetchDashboardStats,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Dashboard</h1>
        <div className="flex flex-wrap gap-2">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.to}
              to={a.to}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {isSuperAdmin && <PlatformHealthSection />}

      {/* Sales Summary */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Sales Summary
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {SALES_SUMMARY_CARDS.map((stat) => (
            <Card key={stat.key} className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{stat.label}</p>
              {isLoading || !stats ? (
                <Skeleton className="mt-2 h-7 w-16" />
              ) : (
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {stat.format(stats[stat.key])}
                </p>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* Inventory Status */}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Inventory Status
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {INVENTORY_STATUS_CARDS.map((stat) => (
            <Card key={stat.key} className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{stat.label}</p>
              {isLoading || !stats ? (
                <Skeleton className="mt-2 h-7 w-16" />
              ) : (
                <p className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {stat.format(stats[stat.key])}
                </p>
              )}
            </Card>
          ))}
        </div>
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Daily Sales (14 days)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.charts.dailySales ?? []}>
                <CartesianGrid strokeDasharray="3 3" className={gridClassName} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Bar dataKey="revenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Weekly Sales (8 weeks)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.charts.weeklySales ?? []}>
                <CartesianGrid strokeDasharray="3 3" className={gridClassName} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Bar dataKey="revenue" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Monthly Sales (12 months)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.charts.monthlySales ?? []}>
                <CartesianGrid strokeDasharray="3 3" className={gridClassName} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Bar dataKey="revenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Revenue Graph (30 days)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.charts.revenueGraph ?? []}>
                <CartesianGrid strokeDasharray="3 3" className={gridClassName} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Line type="monotone" dataKey="revenue" stroke="var(--color-secondary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Inventory Value by Category
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats?.charts.inventoryGraph ?? []} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className={gridClassName} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="categoryName" width={100} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Bar dataKey="totalValue" fill="var(--color-secondary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Customer Growth (12 months)
          </h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats?.charts.customerGrowth ?? []}>
                <CartesianGrid strokeDasharray="3 3" className={gridClassName} />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Line type="monotone" dataKey="newCustomers" stroke="var(--color-primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </section>

      {/* Rankings */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Top Selling Products
          </h3>
          {isLoading ? (
            <SkeletonRows rows={5} columns={2} />
          ) : !stats?.topSellingProducts.length ? (
            <EmptyState title="No sales yet" />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {stats.topSellingProducts.map((p) => (
                <li key={p._id} className="flex items-center justify-between">
                  <span className="truncate">{p.name}</span>
                  <span className="text-gray-500">{p.quantitySold} sold</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Top Categories
          </h3>
          {isLoading ? (
            <SkeletonRows rows={5} columns={2} />
          ) : !stats?.topCategories.length ? (
            <EmptyState title="No sales yet" />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {stats.topCategories.map((c) => (
                <li key={c.categoryId ?? c.categoryName} className="flex items-center justify-between">
                  <span className="truncate">{c.categoryName}</span>
                  <span className="text-gray-500">{formatCurrency(c.revenue)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Top Customers
          </h3>
          {isLoading ? (
            <SkeletonRows rows={5} columns={2} />
          ) : !stats?.topCustomers.length ? (
            <EmptyState title="No customers yet" />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {stats.topCustomers.map((c) => (
                <li key={c.customerId} className="flex items-center justify-between">
                  <span className="truncate">{c.name}</span>
                  <span className="text-gray-500">{formatCurrency(c.totalSpent)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Feeds */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Latest Orders
          </h3>
          {isLoading ? (
            <SkeletonRows rows={5} columns={3} />
          ) : !stats?.latestOrders.length ? (
            <EmptyState title="No orders yet" />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {stats.latestOrders.map((o) => (
                <li key={String(o._id)} className="flex items-center justify-between">
                  <span>{String(o.orderNumber)}</span>
                  <Badge tone="gray">{String(o.status)}</Badge>
                  <span className="text-gray-500">
                    {formatCurrency((o.totals as { grandTotal: number })?.grandTotal ?? 0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Latest Payments
          </h3>
          {isLoading ? (
            <SkeletonRows rows={5} columns={3} />
          ) : !stats?.latestPayments.length ? (
            <EmptyState title="No payments yet" />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {stats.latestPayments.map((p) => (
                <li key={String(p._id)} className="flex items-center justify-between">
                  <span className="font-mono text-xs">{String(p.razorpayOrderId).slice(0, 18)}…</span>
                  <Badge tone={p.status === 'captured' ? 'green' : 'gray'}>{String(p.status)}</Badge>
                  <span className="text-gray-500">{formatCurrency(Number(p.amount) / 100)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Recent Activity
          </h3>
          {isLoading ? (
            <SkeletonRows rows={5} columns={1} />
          ) : !stats?.recentActivity.length ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {stats.recentActivity.map((a) => (
                <li key={String(a._id)} className="flex items-center justify-between gap-2">
                  <span className="truncate">{String(a.message)}</span>
                  <span className="shrink-0 text-xs text-gray-400">{formatDateTime(String(a.createdAt))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">
            Recent Notifications
          </h3>
          {isLoading ? (
            <SkeletonRows rows={5} columns={2} />
          ) : !stats?.recentNotifications.length ? (
            <EmptyState title="No notifications sent yet" />
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {stats.recentNotifications.map((n) => (
                <li key={String(n._id)} className="flex items-center justify-between">
                  <span>{String(n.templateKey)}</span>
                  <Badge tone={n.status === 'sent' ? 'green' : n.status === 'failed' ? 'red' : 'yellow'}>
                    {String(n.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
