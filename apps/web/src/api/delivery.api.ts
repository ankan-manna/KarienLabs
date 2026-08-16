import { createCrudApi } from './createCrudApi';

export interface DeliveryPartner {
  _id: string;
  name: string;
  code: string;
  contactPhone: string;
  isActive: boolean;
}

export const deliveryPartnerApi = createCrudApi<DeliveryPartner>('/delivery/partners');

export interface ShippingZone {
  _id: string;
  name: string;
  states: string[];
  pincodes: string[];
  isActive: boolean;
}

export const shippingZoneApi = createCrudApi<ShippingZone>('/delivery/zones');

export interface ShippingRule {
  _id: string;
  zoneId: string;
  minCartValue: number;
  maxCartValue: number | null;
  charge: number;
  freeShippingThreshold: number | null;
  isActive: boolean;
}

export const shippingRuleApi = createCrudApi<ShippingRule>('/delivery/rules');
