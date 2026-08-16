import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import {
  createBundleHandler,
  deleteBundleHandler,
  getBundleHandler,
  listBundlesHandler,
  updateBundleHandler,
} from './bundle.controller';
import { createBundleSchema, updateBundleSchema } from './bundle.validator';

export const bundleRouter = Router();

bundleRouter.use(requireAuth);

const canRead = authorize(permission(RESOURCES.BUNDLES, ACTIONS.READ));
const canCreate = authorize(permission(RESOURCES.BUNDLES, ACTIONS.CREATE));
const canUpdate = authorize(permission(RESOURCES.BUNDLES, ACTIONS.UPDATE));
const canDelete = authorize(permission(RESOURCES.BUNDLES, ACTIONS.DELETE));

bundleRouter.get('/', canRead, validate(listQuerySchema, 'query'), listBundlesHandler);
bundleRouter.get('/:id', canRead, getBundleHandler);
bundleRouter.post('/', canCreate, validate(createBundleSchema), createBundleHandler);
bundleRouter.patch('/:id', canUpdate, validate(updateBundleSchema), updateBundleHandler);
bundleRouter.delete('/:id', canDelete, deleteBundleHandler);
