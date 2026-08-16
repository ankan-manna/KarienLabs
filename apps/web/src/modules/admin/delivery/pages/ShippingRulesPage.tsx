import { shippingRuleApi, type ShippingRule } from '../../../../api/delivery.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { shippingRuleHooks, shippingZoneHooks } from '../hooks/useDelivery';

export default function ShippingRulesPage() {
  const { data: zones } = shippingZoneHooks.useList({ page: 1, limit: 100 });

  const fields: ConfigField[] = [
    {
      name: 'zoneId',
      label: 'Zone',
      type: 'select',
      options: (zones?.items ?? []).map((z) => ({ label: z.name, value: z._id })),
    },
    { name: 'minCartValue', label: 'Min Cart Value', type: 'number', required: false },
    { name: 'charge', label: 'Charge (₹)', type: 'number' },
    { name: 'freeShippingThreshold', label: 'Free Shipping Threshold', type: 'number', required: false },
  ];

  return (
    <ConfigEntityPage<ShippingRule>
      title="Shipping Rules"
      resource="shipping"
      hooks={shippingRuleHooks}
      fields={fields}
      api={shippingRuleApi}
    />
  );
}
