import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { objectIdSchema } from '../../utils/common-schemas';
import { validate } from '../../utils/validate';

import {
  listMySavedMedicinesHandler,
  removeSavedMedicineHandler,
  saveMedicineHandler,
} from './saved-medicine.controller';

export const savedMedicineRouter = Router();

const saveMedicineSchema = z.object({
  productId: objectIdSchema,
  refillReminderDays: z.number().int().min(1).max(365).optional(),
});

savedMedicineRouter.use(requireAuth);
savedMedicineRouter.get('/', listMySavedMedicinesHandler);
savedMedicineRouter.post('/', validate(saveMedicineSchema), saveMedicineHandler);
savedMedicineRouter.delete('/:id', removeSavedMedicineHandler);
