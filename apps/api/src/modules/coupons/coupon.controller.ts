import type { Request } from 'express';

import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import { getCouponConfig, setCouponConfig } from './coupon-config.service';
import * as couponService from './coupon.service';

export const listCouponsHandler = asyncHandler(async (req, res) => {
  const result = await couponService.listCoupons(req.query as unknown as ListQuery);
  return sendPaginated(res, result.items, result.meta);
});

export const getCouponHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await couponService.getCouponById(req.params.id));
});

export const createCouponHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await couponService.createCoupon(req.body, req.user!.id, req.user!.role));
});

export const updateCouponHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await couponService.updateCoupon(req.params.id, req.body, req.user!.id, req.user!.role),
  );
});

export const deleteCouponHandler = asyncHandler(async (req: Request, res) => {
  await couponService.deleteCoupon(req.params.id, req.user!.id, req.user!.role);
  return sendSuccess(res, { deleted: true });
});

export const toggleCouponHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await couponService.toggleCoupon(req.params.id, req.body.isActive, req.user!.id, req.user!.role),
  );
});

export const getCouponAnalyticsHandler = asyncHandler(async (req, res) => {
  return sendSuccess(res, await couponService.getCouponAnalytics(req.params.id));
});

export const listAvailableCouponsHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await couponService.listAvailableCoupons(req.user!.id));
});

/** Part 21/51 — dry-run validate-against-my-cart, no persistence. */
export const previewCouponHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await couponService.previewCouponForCart(req.user!.id, req.body.code));
});

export const getCouponConfigHandler = asyncHandler(async (_req, res) => {
  return sendSuccess(res, await getCouponConfig());
});

export const setCouponConfigHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await setCouponConfig(req.body, req.user!.id, req.user!.role));
});
