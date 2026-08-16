import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  addDistributorEnquiryNoteHandler,
  assignDistributorEnquiryHandler,
  getDistributorEnquiryAdminHandler,
  listAssignableStaffHandler,
  listDistributorEnquiriesAdminHandler,
  updateDistributorEnquiryStatusHandler,
} from './distributor-enquiry-admin.controller';
import {
  distributorEnquiryAssignmentSchema,
  distributorEnquiryNoteSchema,
  distributorEnquiryStatusUpdateSchema,
} from './distributor-enquiry.validator';

export const distributorEnquiryAdminRouter = Router();

// Prompt 32 Part 35 — its own RESOURCES.DISTRIBUTOR_ENQUIRIES scope, same
// precedent as RETURNS/PRESCRIPTIONS: a Super Admin controls Platform Admin
// visibility into this business-lead domain independently of
// ORDERS/CUSTOMERS permissions, via the SAME RBAC engine (no new
// authorization system).
const canRead = authorize(permission(RESOURCES.DISTRIBUTOR_ENQUIRIES, ACTIONS.READ));
const canManage = authorize(permission(RESOURCES.DISTRIBUTOR_ENQUIRIES, ACTIONS.UPDATE));

distributorEnquiryAdminRouter.use(requireAuth);

distributorEnquiryAdminRouter.get(
  '/',
  canRead,
  validate(listQuerySchema, 'query'),
  listDistributorEnquiriesAdminHandler,
);
distributorEnquiryAdminRouter.get('/assignable-staff', canManage, listAssignableStaffHandler);
distributorEnquiryAdminRouter.get('/:id', canRead, getDistributorEnquiryAdminHandler);
distributorEnquiryAdminRouter.patch(
  '/:id/status',
  canManage,
  validate(distributorEnquiryStatusUpdateSchema),
  updateDistributorEnquiryStatusHandler,
);
distributorEnquiryAdminRouter.patch(
  '/:id/assignment',
  canManage,
  validate(distributorEnquiryAssignmentSchema),
  assignDistributorEnquiryHandler,
);
distributorEnquiryAdminRouter.post(
  '/:id/notes',
  canManage,
  validate(distributorEnquiryNoteSchema),
  addDistributorEnquiryNoteHandler,
);
