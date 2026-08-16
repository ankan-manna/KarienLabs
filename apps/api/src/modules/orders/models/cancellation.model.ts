import { CANCELLATION_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Approval workflow for customer-initiated cancellation of an already-processing order (post-cutoff, not a simple self-service cancel). */
const cancellationSchema = new Schema({
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, required: true },
  status: {
    type: String,
    enum: Object.values(CANCELLATION_STATUS),
    default: CANCELLATION_STATUS.REQUESTED,
    index: true,
  },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  refundId: { type: Schema.Types.ObjectId, ref: 'Refund', default: null },
});

auditPlugin(cancellationSchema);

export type CancellationDocument = InferSchemaType<typeof cancellationSchema>;
export const CancellationModel = model('Cancellation', cancellationSchema);
