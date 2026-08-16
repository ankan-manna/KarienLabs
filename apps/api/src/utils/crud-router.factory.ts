import type { Resource } from '@medcommerce/shared';
import { ACTIONS, permission } from '@medcommerce/shared';
import { Router } from 'express';
import type { ZodSchema } from 'zod';
import { z } from 'zod';

import { requireAuth } from '../middlewares/auth.middleware';
import { authorize } from '../middlewares/rbac.middleware';
import { uploadExcelFile } from '../middlewares/upload.middleware';
import { recordAudit } from '../modules/audit/audit.service';
import type { BaseRepository } from '../repositories/base.repository';

import { sendCreated, sendPaginated, sendSuccess } from './api-response';
import { NotFoundError, ValidationError } from './app-error';
import { asyncHandler } from './async-handler';
import { bulkIdsSchema } from './common-schemas';
import { buildExcelBuffer, parseExcelBuffer, type ExcelColumn } from './excel.util';
import { listQuerySchema, type ListQuery } from './pagination';
import { validate } from './validate';

type AuditAction = Parameters<typeof recordAudit>[0]['action'];

interface CrudRouterOptions<T> {
  /** Permission resource key — every route is gated by `resource:<action>`. */
  resource: Resource;
  repository: BaseRepository<T>;
  createSchema: ZodSchema;
  /** Defaults to `createSchema.partial()` when the schema supports it; pass explicitly for schemas that don't (e.g. z.object with refinements). */
  updateSchema?: ZodSchema;
  /** Human label used in "X not found" error messages, e.g. "Delivery partner". */
  label: string;
  /** Mutates the request body before it's persisted — e.g. slugify, stamp a default field. Runs after validation, before create/update. `isCreate` distinguishes POST from PATCH so hooks can e.g. only stamp `authorId` on create. */
  transformInput?: (
    input: Record<string, unknown>,
    ctx: { user?: { id: string }; isCreate: boolean },
  ) => Record<string, unknown>;
  /** When provided, enables `GET /export/excel` streaming all matching rows through this column mapping. */
  excelColumns?: ExcelColumn[];
  /** Sheet name for the excel export; defaults to `label`. */
  excelSheetName?: string;
  /**
   * Prompt 20 Part 44 — opt-in audit trail for create/update/delete. Purely
   * additive (existing consumers that don't pass this are completely
   * unaffected) — added because notification templates had ZERO audit
   * trail despite being a security/compliance-relevant configuration
   * surface (Part 19's variable-safety rules only matter if changes are
   * traceable to an actor). Any other CRUD resource can opt in the same way.
   */
  auditActions?: { created?: AuditAction; updated?: AuditAction; deleted?: AuditAction };
}

const bulkPatchSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  patch: z.record(z.string(), z.unknown()),
});

/**
 * Stands up the same enterprise CRUD surface (list/get/create/update/delete/bulk-edit/
 * bulk-delete/[export]) that every hand-written module in this codebase already
 * implements — used for simple configuration-style entities (delivery partners,
 * shipping zones/rules, GST settings, CMS content, notification templates) so they
 * don't each need a hand-rolled controller. Modules with real business logic
 * (products, orders, stock adjustments) keep their bespoke service/controller.
 */
export function createCrudRouter<T>(opts: CrudRouterOptions<T>): Router {
  const router = Router();
  const { resource, repository, createSchema, label } = opts;
  const updateSchema = opts.updateSchema ?? (createSchema as unknown as { partial: () => ZodSchema }).partial();

  const canRead = authorize(permission(resource, ACTIONS.READ));
  const canCreate = authorize(permission(resource, ACTIONS.CREATE));
  const canUpdate = authorize(permission(resource, ACTIONS.UPDATE));
  const canDelete = authorize(permission(resource, ACTIONS.DELETE));
  const canExport = authorize(permission(resource, ACTIONS.EXPORT));
  const canImport = authorize(permission(resource, ACTIONS.IMPORT));

  router.use(requireAuth);

  router.get(
    '/',
    canRead,
    validate(listQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as ListQuery;
      const filter: Record<string, unknown> = { ...query.filter };
      const result = await repository.paginate(filter, {
        page: query.page,
        limit: query.limit,
        sort: query.sort,
      });
      return sendPaginated(res, result.items, result.meta);
    }),
  );

  if (opts.excelColumns) {
    router.get(
      '/export/excel',
      canExport,
      asyncHandler(async (req, res) => {
        const { items } = await repository.paginate({}, { limit: 10000, sort: '-createdAt' });
        const buffer = await buildExcelBuffer(
          opts.excelSheetName ?? label,
          opts.excelColumns!,
          items,
        );
        res.setHeader(
          'Content-Type',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${resource}-${Date.now()}.xlsx"`,
        );
        await recordAudit({
          actorId: req.user!.id,
          action: 'export',
          resource,
          after: { rowCount: items.length },
        });
        res.send(buffer);
      }),
    );

    router.post(
      '/import/excel',
      canImport,
      uploadExcelFile,
      asyncHandler(async (req, res) => {
        const file = req.file;
        if (!file) throw new ValidationError('No file uploaded');

        const rows = await parseExcelBuffer(file.buffer);
        const columns = opts.excelColumns!;

        const docs = rows.map((row) => {
          const doc: Record<string, unknown> = {};
          for (const col of columns) {
            // Match by declared key first (import file matches export file exactly),
            // falling back to the column header text so a re-ordered/renamed-column
            // upload still maps correctly, per the header-driven `excelColumns` config.
            const value = row[col.key] ?? row[col.header];
            if (value !== undefined) doc[col.key] = value;
          }
          doc.createdBy = req.user!.id;
          return doc;
        });

        const { inserted, failed } = await repository.bulkCreate(docs);
        await recordAudit({
          actorId: req.user!.id,
          action: 'import',
          resource,
          after: { inserted, failedCount: failed.length },
        });
        return sendSuccess(res, { inserted, failed });
      }),
    );
  }

  router.get(
    '/:id',
    canRead,
    asyncHandler(async (req, res) => {
      const doc = await repository.findById(req.params.id);
      if (!doc) throw new NotFoundError(label);
      return sendSuccess(res, doc);
    }),
  );

  router.post(
    '/',
    canCreate,
    validate(createSchema),
    asyncHandler(async (req, res) => {
      let input: Record<string, unknown> = { ...(req.body as Record<string, unknown>) };
      if (opts.transformInput) input = opts.transformInput(input, { user: req.user, isCreate: true });
      const doc = await repository.create({ ...input, createdBy: req.user!.id });
      if (opts.auditActions?.created) {
        await recordAudit({
          actorId: req.user!.id,
          action: opts.auditActions.created,
          resource,
          resourceId: String((doc as { _id: unknown })._id),
          after: doc,
        });
      }
      return sendCreated(res, doc);
    }),
  );

  router.patch(
    '/:id',
    canUpdate,
    validate(updateSchema),
    asyncHandler(async (req, res) => {
      let input: Record<string, unknown> = { ...(req.body as Record<string, unknown>) };
      if (opts.transformInput) input = opts.transformInput(input, { user: req.user, isCreate: false });
      const updated = await repository.updateById(req.params.id, {
        ...input,
        updatedBy: req.user!.id,
      });
      if (!updated) throw new NotFoundError(label);
      if (opts.auditActions?.updated) {
        await recordAudit({
          actorId: req.user!.id,
          action: opts.auditActions.updated,
          resource,
          resourceId: req.params.id,
          after: updated,
        });
      }
      return sendSuccess(res, updated);
    }),
  );

  router.delete(
    '/:id',
    canDelete,
    asyncHandler(async (req, res) => {
      const deleted = await repository.softDeleteById(req.params.id, req.user!.id);
      if (!deleted) throw new NotFoundError(label);
      if (opts.auditActions?.deleted) {
        await recordAudit({
          actorId: req.user!.id,
          action: opts.auditActions.deleted,
          resource,
          resourceId: req.params.id,
        });
      }
      return sendSuccess(res, { deleted: true });
    }),
  );

  router.post(
    '/bulk-delete',
    canDelete,
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
    canUpdate,
    validate(bulkPatchSchema),
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

  return router;
}
