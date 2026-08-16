import { Schema, model, type InferSchemaType } from 'mongoose';

/** Registered devices for push notifications and "your devices" account UI. */
const deviceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceId: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android', 'web'], required: true },
    pushToken: { type: String, default: null },
    lastActiveAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },
    blockedReason: { type: String, default: '' },
  },
  { timestamps: true },
);

deviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

export type DeviceDocument = InferSchemaType<typeof deviceSchema>;
export const DeviceModel = model('Device', deviceSchema);
