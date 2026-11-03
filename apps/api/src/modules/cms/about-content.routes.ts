import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import type { Request } from 'express';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { validate } from '../../utils/validate';

import { aboutContentSchema } from './about-content.validator';
import { getAboutContent, setAboutContent } from './about-content.service';

/** Admin-only read/write for the homepage "About Us" teaser content — a singleton, not a CRUD list, so it gets its own thin router rather than the generic CRUD factory. */
export const aboutContentRouter = Router();

aboutContentRouter.use(requireAuth);

aboutContentRouter.get('/', authorize(permission(RESOURCES.CMS, ACTIONS.READ)), asyncHandler(async (_req, res) => {
  return sendSuccess(res, await getAboutContent());
}));

aboutContentRouter.put(
  '/',
  authorize(permission(RESOURCES.CMS, ACTIONS.UPDATE)),
  validate(aboutContentSchema),
  asyncHandler(async (req: Request, res) => {
    return sendSuccess(res, await setAboutContent(req.body, req.user!.id));
  }),
);
