import { z } from 'zod';

export const createDeliveryPartnerSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  contactPhone: z.string().optional(),
  serviceablePincodes: z.array(z.string()).optional(),
  apiConfig: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const createShippingZoneSchema = z.object({
  name: z.string().min(1),
  states: z.array(z.string()).optional(),
  pincodes: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

export const createShippingRuleSchema = z.object({
  zoneId: z.string().min(1),
  minCartValue: z.number().min(0).optional(),
  maxCartValue: z.number().min(0).nullable().optional(),
  charge: z.number().min(0),
  freeShippingThreshold: z.number().min(0).nullable().optional(),
  minWeightGrams: z.number().min(0).nullable().optional(),
  maxWeightGrams: z.number().min(0).nullable().optional(),
  deliveryType: z.enum(['standard', 'express']).nullable().optional(),
  isActive: z.boolean().optional(),
});

/** Part 2 — server-side PIN-code serviceability check at checkout. */
export const checkServiceabilitySchema = z.object({
  pincode: z.string().trim().min(4).max(10),
  sellerId: z.string().trim().optional(),
  subtotal: z.number().min(0).optional(),
  state: z.string().trim().optional(),
  totalWeightGrams: z.number().min(0).optional(),
});
