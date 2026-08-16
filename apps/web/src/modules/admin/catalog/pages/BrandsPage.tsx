import { brandApi, type Brand } from '../../../../api/catalog.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { brandHooks } from '../hooks/useBrands';

const fields: ConfigField[] = [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'logoUrl', label: 'Logo URL', type: 'text', required: false },
  { name: 'description', label: 'Description', type: 'textarea', required: false, showInTable: false },
];

export default function BrandsPage() {
  return (
    <ConfigEntityPage<Brand>
      title="Brands"
      resource="brands"
      hooks={brandHooks}
      fields={fields}
      api={brandApi}
    />
  );
}
