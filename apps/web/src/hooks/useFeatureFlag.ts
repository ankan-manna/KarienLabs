import { useQuery } from '@tanstack/react-query';

import { fetchActiveFlags } from '../api/feature-flags.api';

/** One shared query across every `useFeatureFlag` call site — React Query dedupes and caches it, so this never fires more than one request per staleTime window. */
function useActiveFlags() {
  return useQuery({
    queryKey: ['feature-flags', 'active'],
    queryFn: fetchActiveFlags,
    staleTime: 60_000,
  });
}

export function useFeatureFlag(key: string): boolean {
  const { data } = useActiveFlags();
  return !!data?.[key];
}
