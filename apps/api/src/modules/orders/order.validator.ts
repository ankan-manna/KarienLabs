import { ORDER_STATUS } from '@medcommerce/shared';
import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

export const checkoutSchema = z.object({
  addressId: objectIdSchema,
  couponCode: z.string().trim().optional(),
  deliveryType: z.enum(['standard', 'express']).optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(Object.values(ORDER_STATUS) as [string, ...string[]]),
  note: z.string().max(500).optional(),
});

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

// Prompt 27 Part 30/42 — mirrors prescription.validator.ts's
// setPrescriptionConfigSchema (every field optional/partial-mergeable,
// `.strict()` rejects unknown keys before they ever reach the service's own
// whitelist check in fulfillment-config.util.ts).
export const setFulfillmentConfigSchema = z
  .object({
    automationEnabled: z.boolean().optional(),
    orderAdvancementEnabled: z.boolean().optional(),
    shippingAutomationEnabled: z.boolean().optional(),
    labelAutomationEnabled: z.boolean().optional(),
    cronIntervalHours: z.number().positive().max(168).optional(),
    toleranceMinutes: z.number().min(0).max(1440).optional(),
    batchSize: z.number().int().positive().max(500).optional(),
  })
  .strict();
