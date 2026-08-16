import { deliveryPartnerApi, type DeliveryPartner } from '../../../../api/delivery.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { deliveryPartnerHooks } from '../hooks/useDelivery';

const fields: ConfigField[] = [
  { name: 'name', label: 'Name', type: 'text' },
  { name: 'code', label: 'Code', type: 'text' },
  { name: 'contactPhone', label: 'Contact Phone', type: 'text', required: false },
];

export default function DeliveryPartnersPage() {
  return (
    <ConfigEntityPage<DeliveryPartner>
      title="Delivery Partners"
      resource="deliveries"
      hooks={deliveryPartnerHooks}
      fields={fields}
      api={deliveryPartnerApi}
    />
  );
}
