import { supplierApi, type Supplier } from '../../../../api/inventory.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { supplierHooks } from '../hooks/useSuppliers';

const fields: ConfigField[] = [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'contactPerson', label: 'Contact Person', type: 'text', required: false },
  { name: 'phone', label: 'Phone', type: 'text', required: false },
  { name: 'email', label: 'Email', type: 'text', required: false },
  { name: 'gstin', label: 'GSTIN', type: 'text', required: false, showInTable: false },
  { name: 'pan', label: 'PAN', type: 'text', required: false, showInTable: false },
  { name: 'address', label: 'Address', type: 'textarea', required: false, showInTable: false },
  { name: 'paymentTerms', label: 'Payment Terms', type: 'text', required: false, showInTable: false },
  {
    name: 'performanceRating',
    label: 'Performance Rating (0-5)',
    type: 'number',
    required: false,
    showInTable: true,
  },
];

export default function SuppliersPage() {
  return (
    <ConfigEntityPage<Supplier>
      title="Suppliers"
      resource="suppliers"
      hooks={supplierHooks}
      fields={fields}
      api={supplierApi}
    />
  );
}
