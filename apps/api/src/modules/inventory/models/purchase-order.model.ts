import { PURCHASE_ORDER_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Line items embedded — bounded (rarely more than a few dozen), always read/written with the order. */
const purchaseOrderSchema = new Schema({
  poNumber: { type: String, required: true, unique: true },
  supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true, index: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },
  status: {
    type: String,
    enum: Object.values(PURCHASE_ORDER_STATUS),
    default: PURCHASE_ORDER_STATUS.DRAFT,
    index: true,
  },
  items: {
    type: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        variantId: { type: Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
        quantityOrdered: { type: Number, required: true, min: 1 },
        quantityReceived: { type: Number, default: 0, min: 0 },
        unitCost: { type: Number, required: true, min: 0 },
      },
    ],
    default: [],
    validate: {
      validator: (v: unknown[]) => v.length > 0,
      message: 'At least one line item is required',
    },
  },
  expectedDeliveryDate: { type: Date, default: null },
  notes: { type: String, default: '' },
});

purchaseOrderSchema.index({ supplierId: 1, status: 1 });
purchaseOrderSchema.index({ createdAt: -1 });

auditPlugin(purchaseOrderSchema);

export type PurchaseOrderDocument = InferSchemaType<typeof purchaseOrderSchema>;
export const PurchaseOrderModel = model('PurchaseOrder', purchaseOrderSchema);
