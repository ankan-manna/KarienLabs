import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getConfiguration, setConfiguration } from '../../../api/super-admin.api';
import { Button } from '../../../components/common/Button';
import { Can } from '../../../components/common/Can';
import { Card } from '../../../components/common/Card';
import { Input } from '../../../components/common/Input';
import { Select } from '../../../components/common/Select';
import { Skeleton } from '../../../components/common/Skeleton';
import { toast } from '../../../utils/toast';

/**
 * Must mirror apps/api/src/middlewares/rate-limit-config.util.ts's
 * RATE_LIMIT_POLICIES exactly — each entry corresponds to a REAL,
 * already-mounted Redis-backed limiter, not an aspirational category. "OTP
 * Request" and "OTP Verification" are intentionally ONE policy here
 * ("OTP Request & Verification") because both `/login/verify-otp` and
 * `/login/resend-otp` share a single limiter bucket in the actual
 * implementation; "Admin Login" isn't listed at all because admin and
 * customer accounts authenticate through the exact same route/limiter as
 * plain "Login" — there is no separate enforcement point to configure.
 */
const POLICIES: { id: string; label: string }[] = [
  { id: 'login', label: 'Login / Register / Refresh' },
  { id: 'otp', label: 'OTP Request & Verification' },
  { id: 'passwordReset', label: 'Password Reset' },
  { id: 'search', label: 'Search' },
  { id: 'exportImport', label: 'Export / Import' },
  { id: 'adminApi', label: 'Admin API' },
  { id: 'publicApi', label: 'Public API (Global)' },
];

const WINDOW_OPTIONS = [1, 10, 20, 30, 40, 50, 60];

interface PolicyConfig {
  windowMinutes: number;
  limit: number;
}

type PolicyMap = Record<string, PolicyConfig>;

const NAMESPACE = 'rateLimiting';

export function RateLimitPoliciesSection() {
  const queryClient = useQueryClient();
  const [selectedPolicy, setSelectedPolicy] = useState(POLICIES[0].id);
  const [windowMinutes, setWindowMinutes] = useState(WINDOW_OPTIONS[1]);
  const [requestCount, setRequestCount] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['configuration', NAMESPACE],
    queryFn: () => getConfiguration(NAMESPACE) as Promise<PolicyMap>,
  });

  // Re-seed the form whenever the selected policy or the loaded data changes,
  // so switching the Feature dropdown always shows THAT policy's current
  // values rather than leaving stale values from the previously-selected one.
  useEffect(() => {
    const current = data?.[selectedPolicy];
    setWindowMinutes(current?.windowMinutes ?? WINDOW_OPTIONS[1]);
    setRequestCount(current?.limit != null ? String(current.limit) : '');
  }, [data, selectedPolicy]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const nextValue: PolicyMap = {
        ...(data ?? {}),
        [selectedPolicy]: { windowMinutes, limit: Number(requestCount) },
      };
      return setConfiguration(NAMESPACE, nextValue);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['configuration', NAMESPACE] });
      toast.success('Rate limit policy saved — takes effect on the next request, no restart needed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const parsedCount = Number(requestCount);
  const isCountValid =
    requestCount.trim() !== '' && Number.isInteger(parsedCount) && parsedCount >= 1 && parsedCount <= 100_000;

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Rate Limit Configuration
        </h2>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Super Admin only. Changes apply to live traffic immediately — no server restart or
          deploy required.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Select
              label="Feature / Endpoint"
              value={selectedPolicy}
              onChange={(e) => setSelectedPolicy(e.target.value)}
              options={POLICIES.map((p) => ({ label: p.label, value: p.id }))}
            />
            <Select
              label="Time Window"
              value={String(windowMinutes)}
              onChange={(e) => setWindowMinutes(Number(e.target.value))}
              options={WINDOW_OPTIONS.map((m) => ({
                label: m === 1 ? '1 minute' : `${m} minutes`,
                value: String(m),
              }))}
            />
            <Input
              label="Request Count"
              type="number"
              min={1}
              max={100000}
              step={1}
              value={requestCount}
              onChange={(e) => setRequestCount(e.target.value)}
              error={
                requestCount.trim() !== '' && !isCountValid
                  ? 'Enter a whole number between 1 and 100,000'
                  : undefined
              }
            />
          </div>

          <Can I="update" a="configuration">
            <Button
              className="w-fit"
              disabled={!isCountValid}
              isLoading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Save
            </Button>
          </Can>

          <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2">Feature</th>
                  <th className="px-3 py-2">Window</th>
                  <th className="px-3 py-2">Max Requests</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {POLICIES.map((p) => {
                  const cfg = data?.[p.id];
                  return (
                    <tr key={p.id}>
                      <td className="px-3 py-2 text-gray-900 dark:text-gray-100">{p.label}</td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        {cfg ? `${cfg.windowMinutes} min` : '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        {cfg ? cfg.limit : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
