import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { bulkIdsSchema } from '../../utils/common-schemas';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  bulkDeleteDynamicMenuHandler,
  bulkUpdateDynamicMenuHandler,
  createDynamicMenuHandler,
  deleteDynamicMenuHandler,
  getDynamicMenuHandler,
  getDynamicMenuTreeHandler,
  listDynamicMenuHandler,
  reorderDynamicMenuHandler,
  updateDynamicMenuHandler,
} from './dynamic-menu.controller';

export const dynamicMenuRouter = Router();

dynamicMenuRouter.use(requireAuth);

const canRead = authorize(permission(RESOURCES.MENUS, ACTIONS.READ));
const canCreate = authorize(permission(RESOURCES.MENUS, ACTIONS.CREATE));
const canUpdate = authorize(permission(RESOURCES.MENUS, ACTIONS.UPDATE));
const canDelete = authorize(permission(RESOURCES.MENUS, ACTIONS.DELETE));

const menuBodySchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(150),
  icon: z.string().trim().max(100).optional(),
  path: z.string().trim().max(300).optional(),
  placement: z.enum(['sidebar', 'topnav']).optional(),
  parentId: z.string().trim().nullable().optional(),
  order: z.coerce.number().optional(),
  requiredPermission: z.string().trim().max(150).nullable().optional(),
  requiredRole: z.string().trim().max(100).nullable().optional(),
  requiredFeatureFlag: z.string().trim().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
});

// Extends the shared listQuerySchema with `placement` — a genuine filter
// dimension for this module, kept as its own top-level query param (not
// `filter[placement]=`) to match the pre-existing `/tree?placement=` contract
// the frontend's sidebar-tree fetch already relies on. `limit`'s cap is also
// widened well past the shared schema's 100: DynamicMenuPage.tsx's parent-menu
// picker dropdown deliberately requests `limit=500` (it needs the FULL set to
// populate "select a parent", not one page of it) — the shared default cap
// would otherwise 400 that pre-existing, legitimate call once real pagination
// validation is enforced here.
const dynamicMenuListQuerySchema = listQuerySchema.extend({
  placement: z.enum(['sidebar', 'topnav']).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
});

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string().trim().min(1), order: z.coerce.number() })).min(1),
});

const bulkPatchSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  patch: z.record(z.string(), z.unknown()),
});

// Static sub-paths must be registered before the `/:id` param route below.
dynamicMenuRouter.get(
  '/',
  canRead,
  validate(dynamicMenuListQuerySchema, 'query'),
  listDynamicMenuHandler,
);
dynamicMenuRouter.get('/tree', canRead, getDynamicMenuTreeHandler);
dynamicMenuRouter.post('/reorder', canUpdate, validate(reorderSchema), reorderDynamicMenuHandler);
dynamicMenuRouter.post(
  '/bulk-delete',
  canDelete,
  validate(bulkIdsSchema),
  bulkDeleteDynamicMenuHandler,
);
dynamicMenuRouter.post(
  '/bulk-edit',
  canUpdate,
  validate(bulkPatchSchema),
  bulkUpdateDynamicMenuHandler,
);

dynamicMenuRouter.get('/:id', canRead, getDynamicMenuHandler);
dynamicMenuRouter.post('/', canCreate, validate(menuBodySchema), createDynamicMenuHandler);
dynamicMenuRouter.patch(
  '/:id',
  canUpdate,
  validate(menuBodySchema.partial()),
  updateDynamicMenuHandler,
);
dynamicMenuRouter.delete('/:id', canDelete, deleteDynamicMenuHandler);
