import { deliveryPartnerApi, shippingRuleApi, shippingZoneApi } from '../../../../api/delivery.api';
import { createCrudHooks } from '../../../../hooks/createCrudHooks';

export const deliveryPartnerHooks = createCrudHooks('delivery-partners', deliveryPartnerApi);
export const shippingZoneHooks = createCrudHooks('shipping-zones', shippingZoneApi);
export const shippingRuleHooks = createCrudHooks('shipping-rules', shippingRuleApi);
