import { Schema, model, type InferSchemaType } from 'mongoose';

/** Raw webhook/event audit trail — append-only, kept separate from Payment (the business-state record) for debugging and compliance. TTL'd at 1 year. */
const paymentLogSchema = new Schema({
  razorpayOrderId: { type: String, default: null, index: true },
  razorpayPaymentId: { type: String, default: null, index: true },
  event: { type: String, required: true },
  payload: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
});

paymentLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export type PaymentLogDocument = InferSchemaType<typeof paymentLogSchema>;
export const PaymentLogModel = model('PaymentLog', paymentLogSchema);
