import { categoryApi, type Category } from '../../../../api/catalog.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { CategorySeoFaqFields } from '../components/CategorySeoFaqFields';
import { categoryHooks } from '../hooks/useCategories';

const fields: ConfigField[] = [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'slug', label: 'Slug', type: 'text', required: false },
  {
    name: 'parentId',
    label: 'Parent Category ID',
    type: 'text',
    required: false,
    showInTable: false,
  },
  // (CAT-06) — products in this category inherit these when their
  // own expirable/prescriptionRequired field is left unset. See
  // packages/shared/src/utils/resolve-product-defaults.ts.
  {
    name: 'isExpirableDefault',
    label: 'Expirable by default',
    type: 'boolean',
    defaultValue: true,
    showInTable: false,
  },
  {
    name: 'requiresPrescriptionDefault',
    label: 'Prescription required by default',
    type: 'boolean',
    defaultValue: false,
    showInTable: false,
  },
];

export default function CategoriesPage() {
  return (
    <ConfigEntityPage<Category>
      title="Categories"
      resource="categories"
      hooks={categoryHooks}
      fields={fields}
      api={categoryApi}
      renderExtraFields={() => <CategorySeoFaqFields />}
      extraDefaultValues={(category) => ({
        seo: {
          metaTitle: category?.seo?.metaTitle ?? '',
          metaDescription: category?.seo?.metaDescription ?? '',
          canonicalUrl: category?.seo?.canonicalUrl ?? '',
        },
        faq: category?.faq ?? [],
      })}
    />
  );
}
