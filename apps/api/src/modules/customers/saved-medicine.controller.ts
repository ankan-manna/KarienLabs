import type { Request } from 'express';

import { sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import * as savedMedicineService from './saved-medicine.service';

export const listMySavedMedicinesHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await savedMedicineService.listMySavedMedicines(req.user!.id));
});

export const saveMedicineHandler = asyncHandler(async (req: Request, res) => {
  const { productId, refillReminderDays } = req.body;
  return sendCreated(
    res,
    await savedMedicineService.saveMedicine(req.user!.id, productId, refillReminderDays),
  );
});

export const removeSavedMedicineHandler = asyncHandler(async (req: Request, res) => {
  await savedMedicineService.removeSavedMedicine(req.user!.id, req.params.id);
  return sendSuccess(res, { removed: true });
});
