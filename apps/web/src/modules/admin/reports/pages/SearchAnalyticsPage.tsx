import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import {
  fetchPopularSearches,
  fetchSearchSummary,
  fetchSearchTrend,
  fetchZeroResultSearches,
} from '../../../../api/seo-admin.api';
import { Badge } from '../../../../components/common/Badge';
import { Card } from '../../../../components/common/Card';
import { Select } from '../../../../components/common/Select';
import { SkeletonRows } from '../../../../components/common/Skeleton';
import { useChartTheme } from '../../../../hooks/useChartTheme';

const PRESET_OPTIONS = [
  { label: 'Last 7 Days', value: 'last7days' },
  { label: 'Last 30 Days', value: 'last30days' },
  { label: 'This Month', value: 'currentMonth' },
  { label: 'This Year', value: 'currentYear' },
];

/**
 * Part 33/34/35 — read-only search analytics screen: popular
 * searches, zero-result searches (the actionable "catalog/search gap"
 * signal), and a daily volume trend. No CRUD here by design (Part 35:
 * "analytics/search data is primarily read-only... do not create
 * meaningless CRUD").
 */
export default function SearchAnalyticsPage() {
  const [preset, setPreset] = useState('last30days');
  const range = { preset };
  const { gridClassName, tooltipContentStyle, tooltipLabelStyle, tooltipItemStyle } =
    useChartTheme();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['search-analytics', 'summary', preset],
    queryFn: () => fetchSearchSummary(range),
  });
  const { data: popular, isLoading: popularLoading } = useQuery({
    queryKey: ['search-analytics', 'popular', preset],
    queryFn: () => fetchPopularSearches(range),
  });
  const { data: zeroResult, isLoading: zeroResultLoading } = useQuery({
    queryKey: ['search-analytics', 'zero-result', preset],
    queryFn: () => fetchZeroResultSearches(range),
  });
  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ['search-analytics', 'trend', preset],
    queryFn: () => fetchSearchTrend(range),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-night-text">Search Analytics</h1>
        <div className="w-48">
          <Select
            label=""
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            options={PRESET_OPTIONS}
          />
        </div>
      </div>

      {summaryLoading || !summary ? (
        <SkeletonRows rows={1} columns={3} />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4">
            <p className="text-sm text-gray-500">Total Searches</p>
            <p className="text-2xl font-semibold">{summary.totalSearches}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-500">Distinct Queries</p>
            <p className="text-2xl font-semibold">{summary.distinctQueryCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-sm text-gray-500">Zero-Result Searches</p>
            <p className="text-2xl font-semibold text-red-600">{summary.zeroResultSearches}</p>
          </Card>
        </div>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-night-muted">Daily Search Volume</h2>
        <Card className="p-4">
          {trendLoading ? (
            <SkeletonRows rows={1} columns={1} />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" className={gridClassName} />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip
                  contentStyle={tooltipContentStyle}
                  labelStyle={tooltipLabelStyle}
                  itemStyle={tooltipItemStyle}
                />
                <Bar dataKey="totalSearches" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="zeroResultSearches" fill="#dc2626" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-night-muted">Popular Searches</h2>
          {popularLoading ? (
            <SkeletonRows rows={6} columns={3} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-night-border">
              <table className="w-full min-w-[360px] text-left text-sm">
                <thead className="bg-gray-50 dark:bg-night-surface">
                  <tr>
                    {['Query', 'Searches', 'Avg. Results'].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-night-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(popular ?? []).map((row) => (
                    <tr key={row.query} className="border-t border-gray-100 dark:border-night-border/60">
                      <td className="px-3 py-2 font-medium">{row.query}</td>
                      <td className="px-3 py-2">{row.count}</td>
                      <td className="px-3 py-2">
                        {row.hasResults ? (
                          Math.round(row.avgResultCount)
                        ) : (
                          <Badge tone="red">0</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-night-muted">
            Zero-Result Searches
          </h2>
          {zeroResultLoading ? (
            <SkeletonRows rows={6} columns={3} />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-night-border">
              <table className="w-full min-w-[360px] text-left text-sm">
                <thead className="bg-gray-50 dark:bg-night-surface">
                  <tr>
                    {['Query', 'Count', 'Last Seen'].map((h) => (
                      <th key={h} className="px-3 py-2 font-medium text-gray-600 dark:text-night-muted">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(zeroResult ?? []).map((row) => (
                    <tr key={row.query} className="border-t border-gray-100 dark:border-night-border/60">
                      <td className="px-3 py-2 font-medium">{row.query}</td>
                      <td className="px-3 py-2">{row.count}</td>
                      <td className="px-3 py-2">{new Date(row.lastSeenAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
