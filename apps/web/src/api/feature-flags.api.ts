import type { ApiResponse } from '@medcommerce/shared';

import { httpClient } from './http-client';

export async function fetchActiveFlags(): Promise<Record<string, boolean>> {
  const { data } =
    await httpClient.get<ApiResponse<Record<string, boolean>>>('/feature-flags/active');
  if (!data.success) return {};
  return data.data;
}
