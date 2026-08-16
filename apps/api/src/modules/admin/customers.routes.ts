import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { listQuerySchema, type ListQuery } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import * as customersService from './customers.service';

export const adminCustomersRouter = Router();

const canRead = authorize(permission(RESOURCES.CUSTOMERS, ACTIONS.READ));
const canUpdate = authorize(permission(RESOURCES.CUSTOMERS, ACTIONS.UPDATE));

adminCustomersRouter.use(requireAuth);

adminCustomersRouter.get(
  '/',
  canRead,
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const result = await customersService.listCustomers(req.query as unknown as ListQuery);
    return sendPaginated(res, result.items, result.meta);
  }),
);

adminCustomersRouter.get(
  '/:id',
  canRead,
  asyncHandler(async (req, res) => sendSuccess(res, await customersService.getCustomerDetail(req.params.id))),
);

adminCustomersRouter.patch(
  '/:id/status',
  canUpdate,
  validate(z.object({ isActive: z.boolean() })),
  asyncHandler(async (req, res) =>
    sendSuccess(res, await customersService.setCustomerStatus(req.params.id, req.body.isActive)),
  ),
);
