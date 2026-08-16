import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Distinct from a plain `damage`-type StockMovement — carries the evidence/approval fields a write-off needs. */
const damagedStockSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  quantity: { type: Number, required: true, min: 1 },
  reason: { type: String, required: true },
  evidenceImageUrls: { type: [String], default: [] },
  reportedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
});

auditPlugin(damagedStockSchema);

export type DamagedStockDocument = InferSchemaType<typeof damagedStockSchema>;
export const DamagedStockModel = model('DamagedStock', damagedStockSchema);
