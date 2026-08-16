import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { validate } from '../../utils/validate';

import { getConfigurationHandler, setConfigurationHandler } from './configuration.controller';

export const configurationRouter = Router();

configurationRouter.use(requireAuth);

configurationRouter.get(
  '/:namespace',
  authorize(permission(RESOURCES.CONFIGURATION, ACTIONS.READ)),
  getConfigurationHandler,
);
configurationRouter.put(
  '/:namespace',
  authorize(permission(RESOURCES.CONFIGURATION, ACTIONS.UPDATE)),
  validate(z.object({ value: z.record(z.string(), z.unknown()) })),
  setConfigurationHandler,
);
