import { SHIPMENT_AUDIT_ACTIONS, type ShipmentStatus } from '@medcommerce/shared';
import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { resolveDocumentDownloadUrl } from '../documents/document-storage.helper';

import * as shipmentService from './shipment.service';
import {
  assignAwbForShipment,
  createShiprocketOrderForOrder,
  fetchAndStoreLabel,
  retryShipmentFulfillment,
  syncShipmentTracking,
} from './shiprocket-fulfillment.service';

export const createShipmentHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await shipmentService.createShipment(req.body, req.user!.id));
});

export const listShipmentsHandler = asyncHandler(async (req: Request, res) => {
  const result = await shipmentService.listShipments(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const deliveryReportHandler = asyncHandler(async (_req: Request, res) => {
  return sendSuccess(res, await shipmentService.deliveryReport());
});

export const getShipmentsByOrderHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await shipmentService.getShipmentsByOrderId(req.params.orderId, req.user!),
  );
});

export const getShipmentHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await shipmentService.getShipmentById(req.params.id));
});

export const updateShipmentStatusHandler = asyncHandler(async (req: Request, res) => {
  const { status, location, remarks } = req.body as {
    status: ShipmentStatus;
    location?: string;
    remarks?: string;
  };
  return sendSuccess(
    res,
    await shipmentService.updateShipmentStatus(req.params.id, status, req.user!.id, {
      location,
      remarks,
    }),
  );
});

export const addDeliveryNoteHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await shipmentService.addDeliveryNote(req.params.id, req.body.note, req.user!.id),
  );
});

// --- Prompt 14: Shiprocket fulfillment actions (all admin/staff-only, see shipment.routes.ts) ---

export const createShiprocketShipmentHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await createShiprocketOrderForOrder(req.params.orderId, {
      id: req.user!.id,
      role: req.user!.role,
    }),
  );
});

export const assignAwbHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await assignAwbForShipment(req.params.id, { id: req.user!.id, role: req.user!.role }),
  );
});

export const retryShipmentHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await retryShipmentFulfillment(req.params.orderId, { id: req.user!.id, role: req.user!.role }),
  );
});

export const syncShipmentTrackingHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await syncShipmentTracking(req.params.id, { id: req.user!.id, role: req.user!.role }),
  );
});

/** Part 18/34 — label download is itself an authorized, audited action (not just a static URL fetch), so every access is traceable even though the actual bytes live on Cloudinary. */
/** Prompt 15 Part 8 — resolves a short-lived presigned URL when the label is S3-backed (passthrough for a legacy Cloudinary-stored label), never the raw stored reference. */
export const downloadLabelHandler = asyncHandler(async (req: Request, res) => {
  const shipment = await fetchAndStoreLabel(req.params.id, { id: req.user!.id, role: req.user!.role });
  const labelUrl = await resolveDocumentDownloadUrl(shipment.storageProvider, shipment.labelUrl);
  await recordAudit({
    actorId: req.user!.id,
    actorType: actorTypeForRole(req.user!.role),
    action: SHIPMENT_AUDIT_ACTIONS.ADMIN_DOWNLOADED_LABEL,
    resource: 'shipment',
    resourceId: req.params.id,
  });
  return sendSuccess(res, { labelUrl });
});
