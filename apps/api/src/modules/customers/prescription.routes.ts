import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  approvePrescriptionHandler,
  cancelPrescriptionHandler,
  confirmPrescriptionUploadHandler,
  getPrescriptionConfigHandler,
  getPrescriptionHandler,
  getPrescriptionUploadUrlHandler,
  listMyPrescriptionsHandler,
  listPendingPrescriptionsHandler,
  listPrescriptionsAdminHandler,
  listReusablePrescriptionsHandler,
  rejectPrescriptionHandler,
  reuploadPrescriptionHandler,
  setPrescriptionConfigHandler,
} from './prescription.controller';
import {
  confirmPrescriptionUploadSchema,
  getUploadUrlSchema,
  rejectPrescriptionSchema,
  setPrescriptionConfigSchema,
} from './prescription.validator';

export const prescriptionRouter = Router();

// Part 25/35/42 — its own RESOURCES.PRESCRIPTIONS scope (was
// piggybacked on RESOURCES.CUSTOMERS + ACTIONS.APPROVE before this ),
// same rationale/precedent as  16's RESOURCES.RETURNS. `update` guards
// the Super-Admin-controlled configuration surface specifically (Part 42) —
// distinct from `approve`, which guards the day-to-day review workflow, so a
// role can be granted one without the other.
const canRead = authorize(permission(RESOURCES.PRESCRIPTIONS, ACTIONS.READ));
const canReview = authorize(permission(RESOURCES.PRESCRIPTIONS, ACTIONS.APPROVE));
const canConfigure = authorize(permission(RESOURCES.PRESCRIPTIONS, ACTIONS.UPDATE));

prescriptionRouter.use(requireAuth);

// Customer-facing
prescriptionRouter.post('/upload-url', validate(getUploadUrlSchema), getPrescriptionUploadUrlHandler);
prescriptionRouter.post('/', validate(confirmPrescriptionUploadSchema), confirmPrescriptionUploadHandler);
prescriptionRouter.post(
  '/:id/reupload',
  validate(confirmPrescriptionUploadSchema),
  reuploadPrescriptionHandler,
);
prescriptionRouter.post('/:id/cancel', cancelPrescriptionHandler);
prescriptionRouter.get('/me', listMyPrescriptionsHandler);
prescriptionRouter.get('/reusable', listReusablePrescriptionsHandler);

// Part 39/42 — Super Admin / permitted Platform Admin configuration surface.
prescriptionRouter.get('/config', canConfigure, getPrescriptionConfigHandler);
prescriptionRouter.put(
  '/config',
  canConfigure,
  validate(setPrescriptionConfigSchema),
  setPrescriptionConfigHandler,
);

// Staff-facing review workflow
prescriptionRouter.get(
  '/pending',
  canRead,
  validate(listQuerySchema, 'query'),
  listPendingPrescriptionsHandler,
);
prescriptionRouter.get(
  '/',
  canRead,
  validate(listQuerySchema, 'query'),
  listPrescriptionsAdminHandler,
);
prescriptionRouter.get('/:id', getPrescriptionHandler); // ownership checked in the service layer (customer) / RBAC-equivalent staff read
prescriptionRouter.post('/:id/approve', canReview, approvePrescriptionHandler);
prescriptionRouter.post(
  '/:id/reject',
  canReview,
  validate(rejectPrescriptionSchema),
  rejectPrescriptionHandler,
);
