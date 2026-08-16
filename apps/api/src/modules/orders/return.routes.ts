import { ACTIONS, QC_RESULT, RESOURCES, RETURN_RESOLUTION_TYPE, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { objectIdSchema } from '../../utils/common-schemas';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  approveReturnHandler,
  createReverseShipmentHandler,
  downloadReturnLabelHandler,
  getReturnHandler,
  inspectReturnHandler,
  listMyReturnsHandler,
  listReturnsHandler,
  markPickedUpHandler,
  receiveReturnHandler,
  rejectReturnHandler,
  requestReturnHandler,
  resolveReturnRefundHandler,
  resolveReturnReplacementHandler,
  syncReturnTrackingHandler,
} from './return.controller';

const requestReturnSchema = z.object({
  orderId: objectIdSchema,
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        quantity: z.number().int().min(1),
        reason: z.string().trim().min(3).max(500),
        description: z.string().trim().max(1000).optional(),
        // Part 3 — already-uploaded evidence URLs (via the existing generic
        // /uploads endpoint), never a raw-file upload inside this payload.
        evidenceUrls: z.array(z.string().url()).max(10).optional(),
        requestedResolution: z.enum(Object.values(RETURN_RESOLUTION_TYPE) as [string, ...string[]]).optional(),
      }),
    )
    .min(1),
});

const rejectReturnSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const inspectReturnSchema = z.object({
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        qcResult: z.enum(Object.values(QC_RESULT) as [string, ...string[]]),
        notes: z.string().trim().max(500).optional(),
      }),
    )
    .min(1),
});

export const returnRouter = Router();

// Prompt 16 Part 35 — the return workflow now has its own RESOURCES.RETURNS
// scope instead of piggybacking on RESOURCES.ORDERS (see seed-roles.ts for
// the corresponding grant). `approve` covers the whole staff review/QC/
// dispatch workflow (approve/reject/picked-up/receive/inspect/reverse-
// shipment — mirrors how ORDERS:approve covered the equivalent single-action
// return workflow before this prompt); `refund` is its own action so a role
// could in principle be granted return visibility without refund authority.
const canApprove = authorize(permission(RESOURCES.RETURNS, ACTIONS.APPROVE));
const canRefund = authorize(permission(RESOURCES.RETURNS, ACTIONS.REFUND));
const canRead = authorize(permission(RESOURCES.RETURNS, ACTIONS.READ));

returnRouter.use(requireAuth);

// Customer-facing
returnRouter.get('/mine', validate(listQuerySchema, 'query'), listMyReturnsHandler);
returnRouter.post('/', validate(requestReturnSchema), requestReturnHandler);
returnRouter.get('/:id', getReturnHandler);

// Staff-facing return workflow:
// requested -> approved/rejected -> [reverse shipment] -> picked_up ->
// received -> inspected -> refunded | replaced
returnRouter.get('/', canRead, validate(listQuerySchema, 'query'), listReturnsHandler);
returnRouter.post('/:id/approve', canApprove, approveReturnHandler);
returnRouter.post('/:id/reject', canApprove, validate(rejectReturnSchema), rejectReturnHandler);
returnRouter.post('/:id/picked-up', canApprove, markPickedUpHandler);
returnRouter.post('/:id/receive', canApprove, receiveReturnHandler);
returnRouter.post('/:id/inspect', canApprove, validate(inspectReturnSchema), inspectReturnHandler);
returnRouter.post('/:id/resolve/refund', canRefund, resolveReturnRefundHandler);
returnRouter.post('/:id/resolve/replacement', canApprove, resolveReturnReplacementHandler);

// Reverse logistics (Part 11/13/14) — reuses the existing Shiprocket
// integration; retry-safe/idempotent (see return-shiprocket.service.ts).
returnRouter.post('/:id/reverse-shipment', canApprove, createReverseShipmentHandler);
returnRouter.get('/:id/reverse-shipment/label', canApprove, downloadReturnLabelHandler);
returnRouter.post('/:id/reverse-shipment/sync-tracking', canApprove, syncReturnTrackingHandler);
