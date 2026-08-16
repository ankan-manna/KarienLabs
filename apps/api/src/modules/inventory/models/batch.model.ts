import { BATCH_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * The core inventory unit in pharma: one record per (product/variant, warehouse,
 * batch number). `quantityAvailable` is the live balance — kept in sync by
 * StockMovement entries (append-only ledger) rather than recomputed on read, so
 * stock checks at checkout stay a single indexed lookup.
 */
const batchSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', default: null, index: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },
  batchNumber: { type: String, required: true },
  mfgDate: { type: Date, default: null },
  expiryDate: { type: Date, required: true, index: true },
  quantityReceived: { type: Number, required: true, min: 0 },
  quantityAvailable: { type: Number, required: true, min: 0 },
  unitCost: { type: Number, required: true, min: 0 },
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', default: null },
  purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
  status: {
    type: String,
    enum: Object.values(BATCH_STATUS),
    default: BATCH_STATUS.ACTIVE,
    index: true,
  },

  // Prompt 12 (CAT-04) — the MRP legally printed on THIS specific pack, when
  // it differs from the catalog Product.mrp (real pharma packs can carry a
  // different MRP per batch/print-run). `null`/unset means "no override — use
  // Product.mrp" (see batch-pricing.util.ts's resolveEffectiveBatchMrp,
  // reused by whatever calls it rather than every call site re-deriving
  // `batch.mrp ?? product.mrp` itself). This is the catalog/pack MRP, NOT the
  // customer's selling price — the existing Pricing/Discount/Coupon engine
  // still owns what the customer is actually charged.
  mrp: { type: Number, default: null, min: 0 },
  // Recalls happen at batch granularity (one bad print run/lot), not SKU
  // granularity. `true` blocks the batch from NEW reservation/picking (see
  // order.service.ts's decrementStockFifo) without touching
  // quantityAvailable or deleting the batch — existing orders/shipments that
  // already reserved from it are untouched, and the physical stock record
  // stays intact for recall-tracking/reporting purposes.
  recallFlag: { type: Boolean, default: false, index: true },
});

batchSchema.index({ productId: 1, warehouseId: 1, batchNumber: 1 }, { unique: true });
// FIFO picking and expiry sweeps both scan oldest-expiry-first per product/warehouse.
batchSchema.index({ productId: 1, warehouseId: 1, expiryDate: 1 });
batchSchema.index({ expiryDate: 1, quantityAvailable: 1 });

auditPlugin(batchSchema);

export type BatchDocument = InferSchemaType<typeof batchSchema>;
export const BatchModel = model('Batch', batchSchema);
