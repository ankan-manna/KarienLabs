import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { optionalAuth, requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { objectIdSchema } from '../../utils/common-schemas';
import { validate } from '../../utils/validate';

import {
  createFeatureFlagHandler,
  deleteFeatureFlagHandler,
  getActiveFlagsHandler,
  listFeatureFlagsHandler,
  updateFeatureFlagHandler,
} from './feature-flag.controller';

export const featureFlagRouter = Router();

// Public (but identity-aware when available, for role/user-scoped evaluation).
featureFlagRouter.get('/active', optionalAuth, getActiveFlagsHandler);

const canManage = authorize(permission(RESOURCES.FEATURE_FLAGS, ACTIONS.UPDATE));

featureFlagRouter.use(requireAuth, canManage);

const createSchema = z.object({
  key: z.string().trim().min(2).max(100),
  enabled: z.boolean().optional(),
  scope: z.enum(['global', 'role', 'user']).optional(),
  targetRoles: z.array(z.string()).optional(),
  targetUserIds: z.array(objectIdSchema).optional(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
});

featureFlagRouter.get('/', listFeatureFlagsHandler);
featureFlagRouter.post('/', validate(createSchema), createFeatureFlagHandler);
// A plain `{ enabled }` body (the existing admin toggle UI) or a fuller patch
// (scope/targetRoles/targetUserIds/rolloutPercentage) both go through the same
// endpoint — `createSchema.partial()` accepts either shape.
featureFlagRouter.patch('/:key', validate(createSchema.partial()), updateFeatureFlagHandler);
featureFlagRouter.delete('/:key', deleteFeatureFlagHandler);
