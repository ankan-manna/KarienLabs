import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

/**
 * Part 13/14/19 — anonymous-readable GA4 enablement check. Backs
 * `apps/web/src/lib/analytics.ts`'s dual gate (this DB-backed flag AND the
 * build-time `VITE_GA_MEASUREMENT_ID` must both be present before gtag.js
 * loads). Callers must treat a failed fetch as "disabled" — never let this
 * block page render (see analytics.ts's try/catch).
 */
export async function getPublicAnalyticsConfig(): Promise<{ googleAnalyticsEnabled: boolean }> {
  const { data } = await httpClient.get<ApiResponse<{ googleAnalyticsEnabled: boolean }>>(
    '/public/analytics-config/config',
  );
  if (!data.success) throw new Error(data.error.message);
  return data.data;
}
