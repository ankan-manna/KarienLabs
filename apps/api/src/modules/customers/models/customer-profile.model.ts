import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Extended profile fields kept off the User auth document — profile data isn't needed on every auth check. */
const customerProfileSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  dateOfBirth: { type: Date, default: null },
  gender: { type: String, enum: ['male', 'female', 'other', null], default: null },
  phone: { type: String, default: '' },
  medicalConditions: { type: [String], default: [] },
  allergies: { type: [String], default: [] },
  preferredLanguage: { type: String, default: 'en' },
  avatarUrl: { type: String, default: '' },
  notificationPreferences: {
    orderUpdates: { type: Boolean, default: true },
    paymentUpdates: { type: Boolean, default: true },
    deliveryUpdates: { type: Boolean, default: true },
    offersAndAnnouncements: { type: Boolean, default: true },
    emailEnabled: { type: Boolean, default: true },
    smsEnabled: { type: Boolean, default: true },
  },
});

auditPlugin(customerProfileSchema);

export type CustomerProfileDocument = InferSchemaType<typeof customerProfileSchema>;
export const CustomerProfileModel = model('CustomerProfile', customerProfileSchema);
