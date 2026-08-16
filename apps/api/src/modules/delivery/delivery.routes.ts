import { RESOURCES } from '@medcommerce/shared';
import { Router } from 'express';

import { createCrudRouter } from '../../utils/crud-router.factory';
import { validate } from '../../utils/validate';

import { deliveryPartnerRepository } from './delivery-partner.repository';
import { checkServiceabilityHandler } from './delivery.controller';
import {
  checkServiceabilitySchema,
  createDeliveryPartnerSchema,
  createShippingRuleSchema,
  createShippingZoneSchema,
} from './delivery.validators';
import { shippingRuleRepository } from './shipping-rule.repository';
import { shippingZoneRepository } from './shipping-zone.repository';

/** Delivery/shipping configuration — partners, zones, and per-zone rules. All simple config CRUD, so it's built entirely on the generic factory (see utils/crud-router.factory.ts). */
export const deliveryRouter = Router();

// Public (no auth required — checkout must be able to check this before a
// guest necessarily has a session in every flow) server-side serviceability
// check (Part 2). Registered before the CRUD sub-routers below so it can't
// be shadowed by them.
deliveryRouter.post(
  '/serviceability',
  validate(checkServiceabilitySchema),
  checkServiceabilityHandler,
);

deliveryRouter.use(
  '/partners',
  createCrudRouter({
    resource: RESOURCES.DELIVERIES,
    repository: deliveryPartnerRepository,
    createSchema: createDeliveryPartnerSchema,
    label: 'Delivery partner',
    excelColumns: [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Contact Phone', key: 'contactPhone', width: 18 },
      { header: 'Active', key: 'isActive', width: 10 },
    ],
  }),
);

deliveryRouter.use(
  '/zones',
  createCrudRouter({
    resource: RESOURCES.SHIPPING,
    repository: shippingZoneRepository,
    createSchema: createShippingZoneSchema,
    label: 'Shipping zone',
    excelColumns: [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'Active', key: 'isActive', width: 10 },
    ],
  }),
);

deliveryRouter.use(
  '/rules',
  createCrudRouter({
    resource: RESOURCES.SHIPPING,
    repository: shippingRuleRepository,
    createSchema: createShippingRuleSchema,
    label: 'Shipping rule',
    excelColumns: [
      { header: 'Zone', key: 'zoneId', width: 24 },
      { header: 'Min Cart Value', key: 'minCartValue', width: 16 },
      { header: 'Charge', key: 'charge', width: 12 },
      { header: 'Free Shipping Threshold', key: 'freeShippingThreshold', width: 20 },
      { header: 'Active', key: 'isActive', width: 10 },
    ],
  }),
);
