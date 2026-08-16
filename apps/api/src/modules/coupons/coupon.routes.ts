import { ACTIONS, RESOURCES, permission } from '@medcommerce/shared';
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/rbac.middleware';
import { listQuerySchema } from '../../utils/pagination';
import { validate } from '../../utils/validate';

import { requireCouponManagementEnabled } from './coupon-management.middleware';
import {
  createCouponHandler,
  deleteCouponHandler,
  getCouponAnalyticsHandler,
  getCouponConfigHandler,
  getCouponHandler,
  listAvailableCouponsHandler,
  listCouponsHandler,
  previewCouponHandler,
  setCouponConfigHandler,
  toggleCouponHandler,
  updateCouponHandler,
} from './coupon.controller';
import { createCouponSchema, updateCouponSchema, validateCouponSchema } from './coupon.validator';

export const couponRouter = Router();

couponRouter.use(requireAuth);

const canRead = authorize(permission(RESOURCES.COUPONS, ACTIONS.READ));
// Part 8/9/53 — the SAME permission (`coupons:update`) already gates the
// admin CRUD "update" action; reused for the configuration surface too
// (mirrors prescription-config's reuse of `prescriptions:update`), so a
// Super Admin can grant one Platform Admin coupon-configuration access
// without inventing a second permission.
const canConfigure = authorize(permission(RESOURCES.COUPONS, ACTIONS.UPDATE));

// Self-service — any authenticated customer, not gated behind the admin `coupons:read`
// permission. Registered before `/:id` since `/available` is a single path segment.
couponRouter.get('/available', listAvailableCouponsHandler);
couponRouter.post('/validate', validate(validateCouponSchema), previewCouponHandler);

// Part 8/53 — Super Admin (always) / permitted Platform Admin (via
// `coupons:update`) configuration surface. Deliberately NOT gated by
// requireCouponManagementEnabled — that would make the toggle unreachable
// once switched off.
couponRouter.get('/config', canConfigure, getCouponConfigHandler);
couponRouter.put('/config', canConfigure, validate(z.record(z.unknown())), setCouponConfigHandler);

couponRouter.use(requireCouponManagementEnabled);

couponRouter.get('/', canRead, validate(listQuerySchema, 'query'), listCouponsHandler);
couponRouter.get('/:id', canRead, getCouponHandler);
couponRouter.get('/:id/analytics', canRead, getCouponAnalyticsHandler);
couponRouter.patch(
  '/:id/toggle',
  authorize(permission(RESOURCES.COUPONS, ACTIONS.UPDATE)),
  validate(z.object({ isActive: z.boolean() })),
  toggleCouponHandler,
);
couponRouter.post(
  '/',
  authorize(permission(RESOURCES.COUPONS, ACTIONS.CREATE)),
  validate(createCouponSchema),
  createCouponHandler,
);
couponRouter.patch(
  '/:id',
  authorize(permission(RESOURCES.COUPONS, ACTIONS.UPDATE)),
  validate(updateCouponSchema),
  updateCouponHandler,
);
couponRouter.delete(
  '/:id',
  authorize(permission(RESOURCES.COUPONS, ACTIONS.DELETE)),
  deleteCouponHandler,
);
