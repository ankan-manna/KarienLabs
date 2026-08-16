import { homeSectionApi, type HomeSection } from '../../../../api/cms.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { homeSectionHooks } from '../hooks/useCms';

const fields: ConfigField[] = [
  { name: 'title', label: 'Title', type: 'text' },
  {
    name: 'type',
    label: 'Type',
    type: 'select',
    options: [
      { label: 'Product Grid', value: 'product_grid' },
      { label: 'Category Grid', value: 'category_grid' },
      { label: 'Banner Carousel', value: 'banner_carousel' },
    ],
    defaultValue: 'product_grid',
  },
  {
    name: 'sourceType',
    label: 'Source',
    type: 'select',
    options: [
      { label: 'Manual', value: 'manual' },
      { label: 'Category', value: 'category' },
      { label: 'Tag', value: 'tag' },
      { label: 'Query', value: 'query' },
    ],
    defaultValue: 'manual',
    required: false,
  },
  { name: 'order', label: 'Order', type: 'number', required: false, defaultValue: 0 },
];

export default function HomeSectionsPage() {
  return (
    <ConfigEntityPage<HomeSection>
      title="Homepage Sections"
      resource="cms"
      hooks={homeSectionHooks}
      fields={fields}
      api={homeSectionApi}
    />
  );
}
