import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import { getSeoConfig, setSeoConfig, type SeoConfig } from './seo-config.service';

/**
 * Part 16/17/18/19/46/49/51 — the Super Admin / permitted Platform
 * Admin SEO/AEO/GEO configuration surface. Reuses `RESOURCES.CONFIGURATION`
 * (the same resource the generic platform ConfigurationPage's
 * `/configuration/:namespace` routes already gate on), rather than
 * inventing a new SEO-specific permission — mirrors how coupon/notification/
 * analytics configuration each reused an existing domain permission instead
 * of growing the permission vocabulary per feature.
 *
 * Product/Category SEO field EDITING itself does NOT get a parallel route
 * here — it already goes through the existing `PATCH /products/:id` /
 * `PATCH /categories/:id` endpoints (product.validator.ts /
 * category.validator.ts were extended this  to accept `seo`/`faq`),
 * each of which now also records a dedicated `PRODUCT_SEO_UPDATED` /
 * `CATEGORY_SEO_UPDATED` audit entry when those fields change — adding a
 * second route for the same write would be exactly the "duplicate
 * business logic" anti-pattern this project's standing rules forbid.
 */
export const seoAdminRouter = Router();

seoAdminRouter.use(requireAuth);

const canRead = authorize(permission(RESOURCES.CONFIGURATION, ACTIONS.READ));
const canUpdate = authorize(permission(RESOURCES.CONFIGURATION, ACTIONS.UPDATE));

seoAdminRouter.get(
  '/config',
  canRead,
  asyncHandler(async (_req, res) => sendSuccess(res, await getSeoConfig())),
);

seoAdminRouter.patch(
  '/config',
  canUpdate,
  asyncHandler(async (req, res) => {
    const partial = req.body as Partial<SeoConfig>;
    return sendSuccess(res, await setSeoConfig(partial, req.user!.id, req.user!.role));
  }),
);
