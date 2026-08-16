import { z } from 'zod';

import { gstinSchema, objectIdSchema, stateCodeSchema } from '../../utils/common-schemas';

export const createWarehouseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z.string().trim().min(2).max(20),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  isActive: z.boolean().optional(),
  managerId: objectIdSchema.nullable().optional(),
  capacity: z.number().min(0).nullable().optional(),
  location: z
    .object({
      lat: z.number().optional(),
      lng: z.number().optional(),
    })
    .nullable()
    .optional(),
  status: z.enum(['operational', 'maintenance', 'closed']).optional(),
  // Required on create (CAT-01) — a warehouse must belong to a Seller from the
  // moment it's created going forward. Existing pre-Prompt-11 warehouses
  // without one are backfilled by scripts/migrate-seller-backfill.ts, not by
  // relaxing this requirement.
  sellerId: objectIdSchema,
  gstin: gstinSchema.optional(),
  stateCode: stateCodeSchema.optional(),
  contactPhone: z.string().trim().max(20).optional(),
  contactEmail: z.string().trim().email().max(150).optional().or(z.literal('')),
});

// `sellerId` is intentionally EXCLUDED from the update schema — changing a
// warehouse's seller must go through the dedicated, audited transfer
// endpoint (PATCH /warehouses/:id/transfer-seller) so ownership never
// changes silently via a routine field edit (Prompt 11 Part 4).
export const updateWarehouseSchema = createWarehouseSchema.omit({ sellerId: true }).partial();

export const transferWarehouseSellerSchema = z.object({
  sellerId: objectIdSchema,
  reason: z.string().trim().min(3).max(500),
});
