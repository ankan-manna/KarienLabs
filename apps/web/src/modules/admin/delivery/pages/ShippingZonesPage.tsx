import { shippingZoneApi, type ShippingZone } from '../../../../api/delivery.api';
import { ConfigEntityPage, type ConfigField } from '../../../../components/table/ConfigEntityPage';
import { shippingZoneHooks } from '../hooks/useDelivery';

const fields: ConfigField[] = [{ name: 'name', label: 'Zone Name', type: 'text' }];

export default function ShippingZonesPage() {
  return (
    <ConfigEntityPage<ShippingZone>
      title="Shipping Zones"
      resource="shipping"
      hooks={shippingZoneHooks}
      fields={fields}
      api={shippingZoneApi}
    />
  );
}
