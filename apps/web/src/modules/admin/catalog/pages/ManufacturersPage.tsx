import { manufacturerApi, type Manufacturer } from '../../../../api/catalog.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { manufacturerHooks } from '../hooks/useManufacturers';

const fields: ConfigField[] = [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'licenseNumber', label: 'License Number', type: 'text', required: false },
  { name: 'address', label: 'Address', type: 'textarea', required: false, showInTable: false },
];

export default function ManufacturersPage() {
  return (
    <ConfigEntityPage<Manufacturer>
      title="Manufacturers"
      resource="manufacturers"
      hooks={manufacturerHooks}
      fields={fields}
      api={manufacturerApi}
    />
  );
}
