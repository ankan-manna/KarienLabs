import type { Resource } from '@medcommerce/shared';
import { ACTIONS, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../middlewares/auth.middleware';
import { exportImportRateLimiter } from '../middlewares/rate-limit.middleware';
import { authorize } from '../middlewares/rbac.middleware';
import type { BaseRepository } from '../repositories/base.repository';

import { sendSuccess } from './api-response';
import { asyncHandler } from './async-handler';
import { bulkIdsSchema } from './common-schemas';
import { buildExcelBuffer, type ExcelColumn } from './excel.util';
import { validate } from './validate';

/**
 * Bolts bulk-delete/bulk-edit/export-excel onto a router whose list/get/create/update/delete
 * are already hand-written (Brand, Manufacturer — predate the generic `createCrudRouter`
 * factory and keep their bespoke slug-conflict logic). Mount this on the same router
 * rather than duplicating the factory's whole CRUD surface.
 */
export function attachBulkAndExportRoutes<T>(
  router: Router,
  opts: {
    resource: Resource;
    repository: BaseRepository<T>;
    excelColumns: ExcelColumn[];
    excelSheetName: string;
  },
): Router {
  const { resource, repository, excelColumns, excelSheetName } = opts;

  router.post(
    '/bulk-delete',
    requireAuth,
    authorize(permission(resource, ACTIONS.DELETE)),
    validate(bulkIdsSchema),
    asyncHandler(async (req, res) => {
      const { ids } = req.body as { ids: string[] };
      const result = await repository.bulkSoftDelete(ids, req.user!.id);
      return sendSuccess(res, {
        requested: ids.length,
        succeeded: result.modifiedCount,
        failed: ids.length - result.modifiedCount,
      });
    }),
  );

  router.post(
    '/bulk-edit',
    requireAuth,
    authorize(permission(resource, ACTIONS.UPDATE)),
    asyncHandler(async (req, res) => {
      const { ids, patch } = req.body as { ids: string[]; patch: Record<string, unknown> };
      const result = await repository.bulkUpdate(ids, { ...patch, updatedBy: req.user!.id });
      return sendSuccess(res, {
        requested: ids.length,
        succeeded: result.modifiedCount,
        failed: ids.length - result.modifiedCount,
      });
    }),
  );

  router.get(
    '/export/excel',
    requireAuth,
    authorize(permission(resource, ACTIONS.EXPORT)),
    exportImportRateLimiter,
    asyncHandler(async (_req, res) => {
      const { items } = await repository.paginate({}, { limit: 10000, sort: '-createdAt' });
      const buffer = await buildExcelBuffer(excelSheetName, excelColumns, items);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${resource}-${Date.now()}.xlsx"`);
      res.send(buffer);
    }),
  );

  return router;
}
