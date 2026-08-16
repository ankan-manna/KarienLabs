import { bannerApi, type Banner } from '../../../../api/cms.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { bannerHooks } from '../hooks/useCms';

const fields: ConfigField[] = [
  { name: 'title', label: 'Title', type: 'text' },
  { name: 'imageUrl', label: 'Image URL', type: 'text' },
  { name: 'linkUrl', label: 'Link URL', type: 'text', required: false },
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
];

export default function BannersPage() {
  return (
    <ConfigEntityPage<Banner>
      title="Banners"
      resource="cms"
      hooks={bannerHooks}
      fields={fields}
      api={bannerApi}
    />
  );
}
