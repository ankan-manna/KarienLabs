import { REFUND_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const refundSchema = new Schema({
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  paymentId: { type: Schema.Types.ObjectId, ref: 'Payment', required: true },
  returnId: { type: Schema.Types.ObjectId, ref: 'Return', default: null },
  razorpayRefundId: { type: String, default: null },
  amount: { type: Number, required: true, min: 0 },
  reason: { type: String, default: '' },
  status: {
    type: String,
    enum: Object.values(REFUND_STATUS),
    default: REFUND_STATUS.INITIATED,
    index: true,
  },
  initiatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});

auditPlugin(refundSchema);

export type RefundDocument = InferSchemaType<typeof refundSchema>;
export const RefundModel = model('Refund', refundSchema);
