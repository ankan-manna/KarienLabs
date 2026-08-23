import type { Request } from 'express';

import { sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import { checkPincodeServiceability } from '../orders/shiprocket-fulfillment.service';

/**
 * Public, backend-only serviceability check ( 14 Part 2). Never
 * exposes Shiprocket credentials or raw API responses — see
 * checkPincodeServiceability's own doc comment for the fallback strategy
 * when Shiprocket isn't configured/reachable.
 */
export const checkServiceabilityHandler = asyncHandler(async (req: Request, res) => {
  const { pincode, sellerId, subtotal, state, totalWeightGrams } = req.body as {
    pincode: string;
    sellerId?: string;
    subtotal?: number;
    state?: string;
    totalWeightGrams?: number;
  };
  return sendSuccess(
    res,
    await checkPincodeServiceability({ pincode, sellerId, subtotal, state, totalWeightGrams }),
  );
});
