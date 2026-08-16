import { PURCHASE_REQUEST_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Upstream of PurchaseOrder: a staff member requests items with no supplier
 * chosen and no commitment. Only an approved request can be converted into an
 * actual PurchaseOrder (see purchase-request.service.ts#convertToPurchaseOrder).
 */
const purchaseRequestSchema = new Schema({
  requestNumber: { type: String, required: true, unique: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', required: true, index: true },
  items: {
    type: [
      {
        productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        quantity: { type: Number, required: true, min: 1 },
        estimatedUnitCost: { type: Number, min: 0, default: null },
        notes: { type: String, default: '' },
      },
    ],
    default: [],
    validate: {
      validator: (v: unknown[]) => v.length > 0,
      message: 'At least one line item is required',
    },
  },
  status: {
    type: String,
    enum: Object.values(PURCHASE_REQUEST_STATUS),
    default: PURCHASE_REQUEST_STATUS.PENDING,
    index: true,
  },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  rejectionReason: { type: String, default: '' },
  purchaseOrderId: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', default: null },
  notes: { type: String, default: '' },
});

purchaseRequestSchema.index({ requestedBy: 1, status: 1 });
purchaseRequestSchema.index({ createdAt: -1 });

auditPlugin(purchaseRequestSchema);

export type PurchaseRequestDocument = InferSchemaType<typeof purchaseRequestSchema>;
export const PurchaseRequestModel = model('PurchaseRequest', purchaseRequestSchema);
