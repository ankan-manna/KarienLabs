import { z } from 'zod';

import { objectIdSchema } from '../../utils/common-schemas';

export const createStockAdjustmentSchema = z.object({
  batchId: objectIdSchema,
  warehouseId: objectIdSchema,
  quantityDelta: z
    .number()
    .int()
    .refine((v) => v !== 0, 'quantityDelta must not be zero'),
  reason: z.string().trim().min(3).max(500),
});

// Prompt (Admin Inventory Management) Part 17 — a single-step "Add
// Inventory" action, always a positive addition (Part 15: stock addition is
// the only operation this covers); `.int()` rejects decimals, `.positive()`
// rejects zero/negative, and the upper bound rejects an obviously-mistyped
// or unsafe value (e.g. a stray extra digit) without being so tight it
// blocks a genuine large bulk receipt.
const MAX_QUICK_ADD_QUANTITY = 1_000_000;

const quickAddExistingBatchSchema = z.object({
  mode: z.literal('existing_batch'),
  batchId: objectIdSchema,
  quantity: z.number().int().positive().max(MAX_QUICK_ADD_QUANTITY),
  reason: z.string().trim().max(500).optional(),
});

// Manufacturer own-stock (Prompt: "Manufacturer Inventory Model") — creates
// the batch AND adds the quantity in one step, with no Purchase Order/GRN
// involved (KarienLabs manufactures its own products, so there's no
// supplier to receive goods from). Reuses the exact same Batch fields GRN
// already populates (mfgDate/expiryDate/unitCost/mrp) — same schema, same
// downstream FEFO/expiry logic, just a different, PO-free entry point.
const quickAddNewBatchSchema = z.object({
  mode: z.literal('new_batch'),
  productId: objectIdSchema,
  warehouseId: objectIdSchema,
  variantId: objectIdSchema.nullable().optional(),
  batchNumber: z.string().trim().min(1).max(100),
  mfgDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date(),
  unitCost: z.number().min(0).optional(),
  mrp: z.number().min(0).optional(),
  quantity: z.number().int().positive().max(MAX_QUICK_ADD_QUANTITY),
  reason: z.string().trim().max(500).optional(),
});

export const quickAddStockSchema = z
  .discriminatedUnion('mode', [quickAddExistingBatchSchema, quickAddNewBatchSchema])
  .refine(
    (data) => data.mode !== 'new_batch' || !data.mfgDate || data.expiryDate > data.mfgDate,
    { message: 'Expiry date must be after the manufacturing date', path: ['expiryDate'] },
  )
  .refine((data) => data.mode !== 'new_batch' || data.expiryDate > new Date(), {
    message: 'Expiry date must be in the future',
    path: ['expiryDate'],
  });
