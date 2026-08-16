import { gstSettingApi, type GstSetting } from '../../../../api/tax.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { gstSettingHooks } from '../hooks/useTax';

const fields: ConfigField[] = [
  { name: 'hsnCode', label: 'HSN Code', type: 'text' },
  { name: 'description', label: 'Description', type: 'text', required: false },
  { name: 'gstRate', label: 'GST Rate (%)', type: 'number' },
  { name: 'cessRate', label: 'Cess Rate (%)', type: 'number', required: false },
];

export default function GstSettingsPage() {
  return (
    <ConfigEntityPage<GstSetting>
      title="GST Settings"
      resource="tax"
      hooks={gstSettingHooks}
      fields={fields}
      api={gstSettingApi}
    />
  );
}
