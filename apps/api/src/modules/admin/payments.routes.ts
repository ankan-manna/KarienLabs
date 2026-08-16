import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { listQuerySchema, type ListQuery } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import * as paymentsAdminService from './payments.service';

export const adminPaymentsRouter = Router();

const canRead = authorize(permission(RESOURCES.PAYMENTS, ACTIONS.READ));
const canRefund = authorize(permission(RESOURCES.PAYMENTS, ACTIONS.REFUND));

adminPaymentsRouter.use(requireAuth);

adminPaymentsRouter.get(
  '/',
  canRead,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await paymentsAdminService.listPayments(req.query as unknown as ListQuery);
    return sendPaginated(res, result.items, result.meta);
  }),
);

adminPaymentsRouter.get(
  '/failed',
  canRead,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await paymentsAdminService.listFailedPayments(req.query as unknown as ListQuery);
    return sendPaginated(res, result.items, result.meta);
  }),
);

adminPaymentsRouter.get(
  '/:id',
  canRead,
  asyncHandler(async (req, res) => sendSuccess(res, await paymentsAdminService.getPaymentById(req.params.id))),
);

const refundSchema = z.object({
  amountInPaise: z.number().int().positive().optional(),
  reason: z.string().optional(),
});

adminPaymentsRouter.post(
  '/:id/refund',
  canRefund,
  validate(refundSchema),
  asyncHandler(async (req: Request, res) =>
    sendSuccess(res, await paymentsAdminService.issueRefund(req.params.id, req.body, req.user!.id)),
  ),
);
