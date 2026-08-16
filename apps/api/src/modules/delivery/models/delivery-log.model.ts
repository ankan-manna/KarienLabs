import { Schema, model, type InferSchemaType } from 'mongoose';

/** Raw external webhook capture from delivery partners — distinct from Shipment.trackingEvents (the curated customer-facing timeline). Append-only, TTL'd 1 year. */
const deliveryLogSchema = new Schema({
  shipmentId: { type: Schema.Types.ObjectId, ref: 'Shipment', required: true, index: true },
  deliveryPartnerId: { type: Schema.Types.ObjectId, ref: 'DeliveryPartner', required: true },
  rawPayload: { type: Schema.Types.Mixed, required: true },
  receivedAt: { type: Date, default: Date.now },
});

deliveryLogSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 365 * 24 * 60 * 60 });

export type DeliveryLogDocument = InferSchemaType<typeof deliveryLogSchema>;
export const DeliveryLogModel = model('DeliveryLog', deliveryLogSchema);
