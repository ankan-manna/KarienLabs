import { logger } from '../../config/logger';
import { CouponModel } from '../../modules/coupons/models/coupon.model';

/** Deactivates coupons past their validTo date — a coupon whose window has lapsed should stop being offered even if an admin never manually disabled it. */
export async function runCouponExpirySweepJob(): Promise<number> {
  const result = await CouponModel.updateMany(
    { isActive: true, validTo: { $lt: new Date() } },
    { isActive: false },
  );

  if (result.modifiedCount > 0) {
    logger.info({ count: result.modifiedCount }, 'Coupon expiry sweep deactivated expired coupons');
  }

  return result.modifiedCount;
}
