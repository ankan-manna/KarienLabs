import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  addDeliveryNoteHandler,
  assignAwbHandler,
  createShipmentHandler,
  createShiprocketShipmentHandler,
  deliveryReportHandler,
  downloadLabelHandler,
  getShipmentHandler,
  getShipmentsByOrderHandler,
  listShipmentsHandler,
  retryShipmentHandler,
  syncShipmentTrackingHandler,
  updateShipmentStatusHandler,
} from './shipment.controller';
import {
  addDeliveryNoteSchema,
  createShipmentSchema,
  updateShipmentStatusSchema,
} from './shipment.validator';

export const shipmentRouter = Router();

const canCreate = authorize(permission(RESOURCES.DELIVERIES, ACTIONS.CREATE));
const canRead = authorize(permission(RESOURCES.DELIVERIES, ACTIONS.READ));
const canUpdate = authorize(permission(RESOURCES.DELIVERIES, ACTIONS.UPDATE));

shipmentRouter.use(requireAuth);

shipmentRouter.post('/', canCreate, validate(createShipmentSchema), createShipmentHandler);
shipmentRouter.get('/', canRead, validate(listQuerySchema, 'query'), listShipmentsHandler);

// Registered before "/:id" so Express doesn't treat "reports" as an :id param.
shipmentRouter.get('/reports/delivery', canRead, deliveryReportHandler);

// Customer-facing (with staff access too) — ownership is checked in the service layer.
shipmentRouter.get('/order/:orderId', getShipmentsByOrderHandler);

// Shiprocket fulfillment actions, keyed by orderId (creation/retry
// happen against the ORDER, which is what identifies a shipment before one
// necessarily exists yet) vs. by shipment :id (everything after a Shipment
// record already exists). Same DELIVERIES permission gates as the rest of
// this router — no separate shipping permission engine (Part 29).
shipmentRouter.post('/order/:orderId/shiprocket', canCreate, createShiprocketShipmentHandler);
shipmentRouter.post('/order/:orderId/retry', canUpdate, retryShipmentHandler);

shipmentRouter.get('/:id', canRead, getShipmentHandler);
shipmentRouter.post('/:id/assign-awb', canUpdate, assignAwbHandler);
shipmentRouter.post('/:id/sync-tracking', canUpdate, syncShipmentTrackingHandler);
shipmentRouter.get('/:id/label', canRead, downloadLabelHandler);
shipmentRouter.patch(
  '/:id/status',
  canUpdate,
  validate(updateShipmentStatusSchema),
  updateShipmentStatusHandler,
);
shipmentRouter.patch(
  '/:id/notes',
  canUpdate,
  validate(addDeliveryNoteSchema),
  addDeliveryNoteHandler,
);
