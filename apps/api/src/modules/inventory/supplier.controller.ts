import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as supplierService from './supplier.service';

export const listSuppliersHandler = asyncHandler(async (req, res) => {
  const result = await supplierService.listSuppliers(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getSupplierHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await supplierService.getSupplierById(req.params.id));
});

export const createSupplierHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await supplierService.createSupplier(req.body, req.user!.id));
});

export const updateSupplierHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await supplierService.updateSupplier(req.params.id, req.body, req.user!.id),
  );
});

export const deleteSupplierHandler = asyncHandler(async (req: Request, res) => {
  await supplierService.deleteSupplier(req.params.id, req.user!.id);
  return sendSuccess(res, { deleted: true });
});

export const bulkDeleteSuppliersHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await supplierService.bulkDeleteSuppliers(req.body.ids, req.user!.id));
});

export const bulkEditSuppliersHandler = asyncHandler(async (req: Request, res) => {
  const { ids, patch } = req.body as { ids: string[]; patch: Record<string, unknown> };
  return sendSuccess(res, await supplierService.bulkEditSuppliers(ids, patch, req.user!.id));
});

export const supplierPurchaseHistoryHandler = asyncHandler(async (req, res) => {
  const result = await supplierService.getSupplierPurchaseHistory(
    req.params.id,
    req.query as unknown as ListQuery,
  );
  return sendSuccess(res, { items: result.items, summary: result.summary }, 200, result.meta);
});

export const exportSuppliersHandler = asyncHandler(async (_req, res) => {
  const buffer = await supplierService.exportSuppliersToExcel();
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', 'attachment; filename="suppliers.xlsx"');
  res.send(buffer);
});
