import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';

import {
  emailInvoiceHandler,
  getInvoiceByOrderHandler,
  getInvoiceDownloadUrlHandler,
  listMyInvoicesHandler,
  regenerateInvoiceHandler,
} from './invoice.controller';

export const invoiceRouter = Router();

const canUpdate = authorize(permission(RESOURCES.INVOICES, ACTIONS.UPDATE));

invoiceRouter.use(requireAuth);
invoiceRouter.get('/me', listMyInvoicesHandler);
invoiceRouter.get('/order/:orderId', getInvoiceByOrderHandler);
invoiceRouter.get('/order/:orderId/download-url', getInvoiceDownloadUrlHandler);
invoiceRouter.post('/:orderId/email', emailInvoiceHandler);
invoiceRouter.post('/:orderId/regenerate', canUpdate, regenerateInvoiceHandler);
