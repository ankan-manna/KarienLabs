import { STOCK_MOVEMENT_TYPES } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Append-only ledger — never updated or deleted (no audit plugin: soft-delete
 * doesn't apply to an immutable log). Every Batch.quantityAvailable change must
 * be accompanied by one of these, so stock history is always reconstructable.
 */
const stockMovementSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },
  type: { type: String, enum: Object.values(STOCK_MOVEMENT_TYPES), required: true },
  quantity: { type: Number, required: true }, // positive = in, negative = out
  balanceAfter: { type: Number, required: true },
  referenceType: { type: String, default: null }, // 'order' | 'purchase_order' | 'adjustment' | 'transfer'
  referenceId: { type: Schema.Types.ObjectId, default: null },
  performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

stockMovementSchema.index({ batchId: 1, createdAt: -1 });
stockMovementSchema.index({ referenceType: 1, referenceId: 1 });

export type StockMovementDocument = InferSchemaType<typeof stockMovementSchema>;
export const StockMovementModel = model('StockMovement', stockMovementSchema);
