import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import { getPrescriptionConfig, setPrescriptionConfig } from './prescription-config.service';
import * as prescriptionService from './prescription.service';

// --- Configuration (Part 38/39/42) ---

export const getPrescriptionConfigHandler = asyncHandler(async (_req: Request, res) => {
  return sendSuccess(res, await getPrescriptionConfig());
});

export const setPrescriptionConfigHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await setPrescriptionConfig(req.body, req.user!.id, req.user!.role),
  );
});

// --- Upload ---

export const getPrescriptionUploadUrlHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await prescriptionService.getPrescriptionUploadUrl(req.user!.id, req.body));
});

export const confirmPrescriptionUploadHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(
    res,
    await prescriptionService.confirmPrescriptionUpload(req.user!.id, req.body),
  );
});

export const reuploadPrescriptionHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(
    res,
    await prescriptionService.reuploadPrescription(req.params.id, req.user!.id, req.body),
  );
});

export const cancelPrescriptionHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await prescriptionService.cancelPrescription(req.params.id, req.user!.id));
});

// --- Listing ---

export const listMyPrescriptionsHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await prescriptionService.listMyPrescriptions(req.user!.id));
});

export const listReusablePrescriptionsHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await prescriptionService.listReusablePrescriptions(req.user!.id));
});

export const listPendingPrescriptionsHandler = asyncHandler(async (req, res) => {
  return sendSuccess(
    res,
    await prescriptionService.listPendingPrescriptions(req.query as unknown as ListQuery),
  );
});

export const listPrescriptionsAdminHandler = asyncHandler(async (req: Request, res) => {
  const result = await prescriptionService.listPrescriptionsAdmin(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

// --- Detail / review ---

export const getPrescriptionHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await prescriptionService.getPrescriptionById(req.params.id, req.user!));
});

export const approvePrescriptionHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await prescriptionService.approvePrescription(req.params.id, req.user!.id, req.user!.role),
  );
});

export const rejectPrescriptionHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await prescriptionService.rejectPrescription(
      req.params.id,
      req.body.rejectionReason,
      req.user!.id,
      req.user!.role,
    ),
  );
});
