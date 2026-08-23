import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Goods Receipt Note — confirms physical receipt against a PurchaseOrder.
 * On completion this is what triggers Batch creation + a `receipt` StockMovement
 * entry per line item (business logic lands with the Inventory domain in  7).
 */
const grnSchema = new Schema({
  grnNumber: { type: String, required: true, unique: true },
  purchaseOrderId: {
    type: Schema.Types.ObjectId,
    ref: 'PurchaseOrder',
    required: true,
    index: true,
  },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true },
  receivedItems: {
    type: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
        batchNumber: { type: String, required: true },
        mfgDate: { type: Date, default: null },
        expiryDate: { type: Date, required: true },
        quantityReceived: { type: Number, required: true, min: 1 },
        unitCost: { type: Number, required: true, min: 0 },
      },
    ],
    default: [],
    validate: {
      validator: (v: unknown[]) => v.length > 0,
      message: 'At least one line item is required',
    },
  },
  receivedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  receivedAt: { type: Date, default: Date.now },
});

auditPlugin(grnSchema);

export type GrnDocument = InferSchemaType<typeof grnSchema>;
export const GrnModel = model('Grn', grnSchema);
