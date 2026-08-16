import { Schema, model, type InferSchemaType } from 'mongoose';

/** Distinct from Wishlist — drives refill reminders, not a browse-later list. */
const savedMedicineSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  refillReminderDays: { type: Number, default: 30 },
  nextReminderAt: { type: Date, default: null, index: true },
  isActive: { type: Boolean, default: true },
});

savedMedicineSchema.index({ userId: 1, productId: 1 }, { unique: true });

export type SavedMedicineDocument = InferSchemaType<typeof savedMedicineSchema>;
export const SavedMedicineModel = model('SavedMedicine', savedMedicineSchema);
