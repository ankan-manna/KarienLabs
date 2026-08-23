import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { listQuerySchema, type ListQuery } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import * as invoicesAdminService from './invoices.service';

export const adminInvoicesRouter = Router();

const canRead = authorize(permission(RESOURCES.INVOICES, ACTIONS.READ));

adminInvoicesRouter.use(requireAuth);

adminInvoicesRouter.get(
  '/',
  canRead,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await invoicesAdminService.listInvoicesAdmin(req.query as unknown as ListQuery);
    return sendPaginated(res, result.items, result.meta);
  }),
);

/** Part 9/26 — admin document-download action (short-lived presigned URL when S3-backed), gated by the same `invoices:read` permission as the list above (Super Admin controls Platform Admin access to this via the existing RBAC seed, Part 34). */
adminInvoicesRouter.get(
  '/:id/download-url',
  canRead,
  asyncHandler(async (req, res) => {
    return sendSuccess(res, await invoicesAdminService.getInvoiceDownloadUrlAdmin(req.params.id));
  }),
);
