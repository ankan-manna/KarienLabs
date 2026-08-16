import { STOCK_TRANSFER_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const stockTransferSchema = new Schema({
  batchId: { type: Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },
  fromWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  toWarehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  quantity: { type: Number, required: true, min: 1 },
  status: {
    type: String,
    enum: Object.values(STOCK_TRANSFER_STATUS),
    default: STOCK_TRANSFER_STATUS.PENDING,
    index: true,
  },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  receivedAt: { type: Date, default: null },
});

auditPlugin(stockTransferSchema);

export type StockTransferDocument = InferSchemaType<typeof stockTransferSchema>;
export const StockTransferModel = model('StockTransfer', stockTransferSchema);
