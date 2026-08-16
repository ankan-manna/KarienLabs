import { STOCK_ADJUSTMENT_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Approval workflow for manual stock corrections — approval triggers the resulting StockMovement entry. */
const stockAdjustmentSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  quantityDelta: { type: Number, required: true }, // signed: +increase, -decrease
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: Object.values(STOCK_ADJUSTMENT_STATUS),
    default: STOCK_ADJUSTMENT_STATUS.PENDING,
    index: true,
  },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
});

auditPlugin(stockAdjustmentSchema);

export type StockAdjustmentDocument = InferSchemaType<typeof stockAdjustmentSchema>;
export const StockAdjustmentModel = model('StockAdjustment', stockAdjustmentSchema);
