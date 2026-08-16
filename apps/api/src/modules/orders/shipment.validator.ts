import { SHIPMENT_STATUS } from '@medcommerce/shared';
import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

export const createShipmentSchema = z.object({
  orderId: objectIdSchema,
  deliveryPartnerId: objectIdSchema.optional(),
  trackingNumber: z.string().trim().optional(),
  itemIds: z.array(objectIdSchema).optional(),
  estimatedDeliveryDate: z.coerce.date().optional(),
});

export const updateShipmentStatusSchema = z.object({
  status: z.enum(Object.values(SHIPMENT_STATUS) as [string, ...string[]]),
  location: z.string().trim().max(255).optional(),
  remarks: z.string().trim().max(500).optional(),
});

export const addDeliveryNoteSchema = z.object({
  note: z.string().trim().min(1).max(1000),
});
