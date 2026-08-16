import { NotFoundError } from '../../utils/app-error';

import { SavedMedicineModel } from './models/saved-medicine.model';

export function listMySavedMedicines(userId: string) {
  return SavedMedicineModel.find({ userId, isActive: true }).lean();
}

export async function saveMedicine(userId: string, productId: string, refillReminderDays = 30) {
  return SavedMedicineModel.findOneAndUpdate(
    { userId, productId },
    { refillReminderDays, isActive: true },
    { upsert: true, new: true },
  ).lean();
}

export async function removeSavedMedicine(userId: string, id: string) {
  const result = await SavedMedicineModel.updateOne({ _id: id, userId }, { isActive: false });
  if (result.matchedCount === 0) throw new NotFoundError('Saved medicine');
}
