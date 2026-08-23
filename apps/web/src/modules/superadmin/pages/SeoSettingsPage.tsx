import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getSeoConfig, setSeoConfig, type SeoConfig } from '../../../api/seo-admin.api';
import { Button } from '../../../components/common/Button';
import { Card } from '../../../components/common/Card';
import { Input } from '../../../components/common/Input';
import { Skeleton } from '../../../components/common/Skeleton';
import { Switch } from '../../../components/common/Switch';
import { toast } from '../../../utils/toast';

const DOMAIN_TOGGLES: { key: keyof SeoConfig; label: string }[] = [
  { key: 'productSeoEnabled', label: 'Product SEO' },
  { key: 'categorySeoEnabled', label: 'Category SEO' },
  { key: 'sitemapEnabled', label: 'XML Sitemap' },
  { key: 'robotsEnabled', label: 'Robots (allow indexing)' },
  { key: 'structuredDataEnabled', label: 'Structured Data (schema.org)' },
  { key: 'canonicalEnabled', label: 'Canonical URLs' },
  { key: 'aeoEnabled', label: 'AEO (Answer Engine Optimization)' },
  { key: 'geoEnabled', label: 'GEO (Generative Engine Optimization)' },
];

/**
 * Part 16/17/18/19/46/49 — the dedicated Super Admin / permitted
 * Platform Admin "SEO Settings" configuration page, same pattern as
 * AnalyticsSettingsPage.tsx ( 22): its own page (not a namespace on
 * the generic ConfigurationPage) because writes must go through the
 * validated `/admin/seo/config` endpoint, which cascades the master switch
 * and rejects an inconsistent combination server-side.
 */
export default function SeoSettingsPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SeoConfig | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['seo-config'], queryFn: getSeoConfig });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (partial: Partial<SeoConfig>) => setSeoConfig(partial),
    onSuccess: (saved) => {
      setDraft(saved);
      queryClient.invalidateQueries({ queryKey: ['seo-config'] });
      toast.success('SEO configuration saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading || !draft) return <Skeleton className="h-96 w-full" />;

  function set<K extends keyof SeoConfig>(key: K, value: SeoConfig[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">SEO Settings</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Controls the Search/SEO/AEO/GEO surface platform-wide. Disabling a domain rejects that
        endpoint for every Platform Admin, backend-enforced — never just a hidden frontend toggle.
        Turning off SEO entirely also disables every domain below it.
      </p>

      <Card className="flex flex-col gap-4 p-4">
        <Switch
          label="SEO (master switch)"
          checked={draft.seoEnabled}
          onChange={(checked) => set('seoEnabled', checked)}
        />
        <div className="ml-4 grid grid-cols-1 gap-3 border-l border-gray-100 pl-4 dark:border-gray-800 sm:grid-cols-2">
          {DOMAIN_TOGGLES.map((toggle) => (
            <Switch
              key={toggle.key}
              label={toggle.label}
              checked={draft[toggle.key] as boolean}
              disabled={!draft.seoEnabled}
              onChange={(checked) => set(toggle.key, checked as never)}
            />
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Global SEO Defaults</h2>
        <Input label="Site title" value={draft.siteTitle} onChange={(e) => set('siteTitle', e.target.value)} />
        <Input
          label="Site description"
          value={draft.siteDescription}
          onChange={(e) => set('siteDescription', e.target.value)}
        />
        <Input
          label="Default OG image"
          hint="Relative path (e.g. /logo.jpg) or an absolute URL."
          value={draft.defaultOgImage}
          onChange={(e) => set('defaultOgImage', e.target.value)}
        />
        <Input
          label="Canonical base URL"
          hint="Leave blank to use the deployment's configured web base URL."
          value={draft.canonicalBaseUrl}
          onChange={(e) => set('canonicalBaseUrl', e.target.value)}
        />
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Search Tunables</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Input
            label="Min query length"
            type="number"
            value={draft.searchMinLength}
            onChange={(e) => set('searchMinLength', Number(e.target.value))}
          />
          <Input
            label="Max query length"
            type="number"
            value={draft.searchMaxLength}
            onChange={(e) => set('searchMaxLength', Number(e.target.value))}
          />
          <Input
            label="Max results per page"
            type="number"
            value={draft.searchMaxResults}
            onChange={(e) => set('searchMaxResults', Number(e.target.value))}
          />
          <Input
            label="Suggestion limit"
            type="number"
            value={draft.suggestionLimit}
            onChange={(e) => set('suggestionLimit', Number(e.target.value))}
          />
          <Input
            label="Cache duration (seconds)"
            type="number"
            value={draft.searchCacheDurationSeconds}
            onChange={(e) => set('searchCacheDurationSeconds', Number(e.target.value))}
          />
        </div>
      </Card>

      <Button className="w-fit" isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate(draft)}>
        Save configuration
      </Button>
    </div>
  );
}
