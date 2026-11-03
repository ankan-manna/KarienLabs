import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { getAboutContent, setAboutContent } from '../../../../api/cms.api';
import type { AboutContent, AboutContentBlock, AboutContentIconKey } from '../../../../api/public-cms.api';
import { Button } from '../../../../components/common/Button';
import { Card } from '../../../../components/common/Card';
import { ImageUpload } from '../../../../components/common/ImageUpload';
import { Input } from '../../../../components/common/Input';
import { Select } from '../../../../components/common/Select';
import { Skeleton } from '../../../../components/common/Skeleton';
import { Textarea } from '../../../../components/common/Textarea';
import { toast } from '../../../../utils/toast';

const ICON_OPTIONS: { value: AboutContentIconKey; label: string }[] = [
  { value: 'values', label: 'Checkmark (values)' },
  { value: 'compass', label: 'Compass (vision)' },
  { value: 'rx', label: 'Prescription (Rx)' },
  { value: 'lock', label: 'Lock (security)' },
  { value: 'verified', label: 'Verified / shield-check' },
  { value: 'truck', label: 'Delivery truck' },
  { value: 'heart', label: 'Heart' },
  { value: 'shield', label: 'Shield' },
];

const EMPTY_BLOCK: AboutContentBlock = { iconKey: 'values', title: '', description: '' };

const EMPTY_FORM: Required<AboutContent> = {
  tagline: '',
  heading: '',
  description: '',
  mainImageUrl: '',
  mainImagePublicId: null,
  mainImageAlt: '',
  blocks: [],
  highlightsTagline: '',
  highlightsHeading: '',
  highlightsDescription: '',
  highlightsImageUrl: '',
  highlightsImagePublicId: null,
  highlightsImageAlt: '',
  highlights: [],
};

function BlockListEditor({
  blocks,
  onChange,
}: {
  blocks: AboutContentBlock[];
  onChange: (next: AboutContentBlock[]) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {blocks.map((block, i) => (
        <div key={i} className="flex flex-col gap-2 rounded border border-gray-100 p-3 dark:border-gray-800/60">
          <div className="flex items-start gap-2">
            <div className="w-40 flex-shrink-0">
              <Select
                label={i === 0 ? 'Icon' : undefined}
                value={block.iconKey}
                options={ICON_OPTIONS}
                onChange={(e) => {
                  const next = [...blocks];
                  next[i] = { ...block, iconKey: e.target.value as AboutContentIconKey };
                  onChange(next);
                }}
              />
            </div>
            <div className="flex-1">
              <Input
                label={i === 0 ? 'Title' : undefined}
                value={block.title}
                onChange={(e) => {
                  const next = [...blocks];
                  next[i] = { ...block, title: e.target.value };
                  onChange(next);
                }}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="danger"
              className={i === 0 ? 'mt-6' : undefined}
              onClick={() => onChange(blocks.filter((_, idx) => idx !== i))}
            >
              Remove
            </Button>
          </div>
          <Textarea
            label={i === 0 ? 'Description' : undefined}
            rows={2}
            value={block.description}
            onChange={(e) => {
              const next = [...blocks];
              next[i] = { ...block, description: e.target.value };
              onChange(next);
            }}
          />
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => onChange([...blocks, { ...EMPTY_BLOCK }])}>
        + Add block
      </Button>
    </div>
  );
}

/**
 * Dynamic CMS (Prompt 3) — admin editor for the homepage "About Us" teaser
 * (heading/description/main image/value blocks) and the "Why BRENTIS"
 * highlights block beneath it. Bespoke form (same pattern as
 * SiteSettingsPage.tsx) rather than ConfigEntityPage, since this is a
 * singleton document, not a CRUD list. Content source: real Vision/Mission
 * copy from aboutus.txt and operational facts already true elsewhere in this
 * codebase — never fabricated. See docs/BRENTIS_DYNAMIC_CMS_AUDIT.md.
 */
export default function AboutContentPage() {
  const [form, setForm] = useState<Required<AboutContent>>(EMPTY_FORM);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['cms-about'], queryFn: getAboutContent });

  useEffect(() => {
    if (!data) return;
    setForm({ ...EMPTY_FORM, ...data });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => setAboutContent(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-about'] });
      toast.success('About Us content saved');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">About Us (Homepage)</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Controls the homepage &quot;About BRENTIS HEALTHCARE&quot; teaser section and the &quot;Why
          BRENTIS&quot; highlights section beneath it. The full About Us page (/about) is a separate,
          long-form document — edit it under Website Design → Pages.
        </p>
      </div>

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">About block</h2>
        <Input label="Eyebrow / tagline" value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
        <Input label="Heading" value={form.heading} onChange={(e) => setForm({ ...form, heading: e.target.value })} />
        <Textarea
          label="Description"
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Main image</label>
          <ImageUpload
            preset="cms_media"
            folder="about"
            value={form.mainImageUrl}
            onUploaded={(asset) => setForm({ ...form, mainImageUrl: asset.url, mainImagePublicId: asset.publicId })}
            onRemove={form.mainImageUrl ? () => setForm({ ...form, mainImageUrl: '', mainImagePublicId: null }) : undefined}
          />
        </div>
        <Input
          label="Main image alt text"
          value={form.mainImageAlt}
          onChange={(e) => setForm({ ...form, mainImageAlt: e.target.value })}
        />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Value blocks</h3>
        <BlockListEditor blocks={form.blocks} onChange={(blocks) => setForm({ ...form, blocks })} />
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Why BRENTIS / highlights block</h2>
        <Input
          label="Eyebrow / tagline"
          value={form.highlightsTagline}
          onChange={(e) => setForm({ ...form, highlightsTagline: e.target.value })}
        />
        <Input
          label="Heading"
          value={form.highlightsHeading}
          onChange={(e) => setForm({ ...form, highlightsHeading: e.target.value })}
        />
        <Textarea
          label="Description"
          rows={3}
          value={form.highlightsDescription}
          onChange={(e) => setForm({ ...form, highlightsDescription: e.target.value })}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Image</label>
          <ImageUpload
            preset="cms_media"
            folder="about"
            value={form.highlightsImageUrl}
            onUploaded={(asset) =>
              setForm({ ...form, highlightsImageUrl: asset.url, highlightsImagePublicId: asset.publicId })
            }
            onRemove={
              form.highlightsImageUrl
                ? () => setForm({ ...form, highlightsImageUrl: '', highlightsImagePublicId: null })
                : undefined
            }
          />
        </div>
        <Input
          label="Image alt text"
          value={form.highlightsImageAlt}
          onChange={(e) => setForm({ ...form, highlightsImageAlt: e.target.value })}
        />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Highlight items</h3>
        <BlockListEditor blocks={form.highlights} onChange={(highlights) => setForm({ ...form, highlights })} />
      </Card>

      <Button className="w-fit" isLoading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
        Save About Us Content
      </Button>
    </div>
  );
}
