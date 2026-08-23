import { ROLES } from '@medcommerce/shared';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../utils/app-error';

import { isCouponManagementEnabled } from './coupon-config.service';

/**
 * Part 8/9/10/54 — backend enforcement of the coupon-management
 * feature flag on the admin CRUD/analytics surface. Super Admin always
 * retains access regardless of the flag (otherwise there'd be no way to
 * turn it back on once disabled — the `/coupons/config` routes themselves
 * are gated by the `coupons:update` PERMISSION instead, not this
 * middleware, so a permitted Platform Admin can also always reach the
 * toggle). Every other admin coupon route (list/create/update/delete/
 * toggle/analytics) is hidden AND rejected once Super Admin turns the
 * feature off — never just hidden in the frontend.
 */
export async function requireCouponManagementEnabled(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (req.user?.role === ROLES.SUPER_ADMIN) return next();
    if (await isCouponManagementEnabled()) return next();
    next(new AppError(403, 'COUPON_FEATURE_DISABLED', 'Coupon management is currently disabled'));
  } catch (error) {
    next(error);
  }
}
