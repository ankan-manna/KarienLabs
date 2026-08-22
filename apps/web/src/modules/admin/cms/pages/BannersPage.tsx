import { bannerApi, type Banner } from '../../../../api/cms.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { BannerImageFields } from '../components/BannerImageFields';
import { bannerHooks } from '../hooks/useCms';

const fields: ConfigField[] = [
  { name: 'badge', label: 'Badge (eyebrow text)', type: 'text', required: false, showInTable: false },
  { name: 'title', label: 'Title', type: 'text' },
  { name: 'subtitle', label: 'Subtitle / description', type: 'textarea', required: false, showInTable: false },
  { name: 'ctaText', label: 'CTA button text', type: 'text', required: false, showInTable: false },
  { name: 'linkUrl', label: 'Link URL', type: 'text', required: false },
  {
    name: 'secondaryCtaText',
    label: 'Secondary CTA text (optional)',
    type: 'text',
    required: false,
    showInTable: false,
  },
  {
    name: 'secondaryCtaLink',
    label: 'Secondary CTA link (optional)',
    type: 'text',
    required: false,
    showInTable: false,
  },
  {
    name: 'placement',
    label: 'Placement',
    type: 'select',
    options: [
      { label: 'Hero', value: 'hero' },
      { label: 'Category', value: 'category' },
      { label: 'Checkout', value: 'checkout' },
    ],
    defaultValue: 'hero',
  },
  { name: 'order', label: 'Order', type: 'number', required: false, defaultValue: 0 },
  {
    name: 'slideDurationMs',
    label: 'Slide duration (ms, hero carousel only)',
    type: 'number',
    required: false,
    showInTable: false,
  },
];

/** `2026-08-25T10:00:00.000Z` -> `2026-08-25T10:00`, the format `<input type="datetime-local">` expects. `null`/missing -> `''` (empty, unbounded). */
function toDatetimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function BannersPage() {
  return (
    <ConfigEntityPage<Banner>
      title="Banners"
      resource="cms"
      hooks={bannerHooks}
      fields={fields}
      api={bannerApi}
      renderExtraFields={() => <BannerImageFields />}
      extraDefaultValues={(banner) => ({
        imageUrl: banner?.imageUrl ?? '',
        imageAlt: banner?.imageAlt ?? '',
        imagePublicId: banner?.imagePublicId ?? null,
        startsAt: toDatetimeLocal(banner?.startsAt),
        endsAt: toDatetimeLocal(banner?.endsAt),
      })}
    />
  );
}
