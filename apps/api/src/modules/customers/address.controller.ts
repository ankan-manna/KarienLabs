import type { Request } from 'express';

import { sendCreated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';

import { getPublicAddressVerificationConfig } from './address-verification-config.service';
import * as addressVerificationService from './address-verification.service';
import * as addressService from './address.service';

function requestMeta(req: Request) {
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    requestId: req.requestId,
  };
}

export const listMyAddressesHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(res, await addressService.listMyAddresses(req.user!.id));
});

export const createAddressHandler = asyncHandler(async (req: Request, res) => {
  return sendCreated(res, await addressService.createAddress(req.user!.id, req.body));
});

export const updateAddressHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await addressService.updateAddress(req.user!.id, req.params.id, req.body),
  );
});

export const setDefaultAddressHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await addressService.setDefaultAddress(req.user!.id, req.params.id, req.body.isDefault),
  );
});

export const deleteAddressHandler = asyncHandler(async (req: Request, res) => {
  await addressService.deleteAddress(req.user!.id, req.params.id);
  return sendSuccess(res, { deleted: true });
});

/** Authenticated-safe subset the checkout/address-form UI needs to decide whether to surface "verification required" messaging — mirrors authConfigHandler's public-config pattern. */
export const addressVerificationConfigHandler = asyncHandler(async (_req: Request, res) => {
  return sendSuccess(res, await getPublicAddressVerificationConfig());
});

export const requestAddressMobileOtpHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await addressVerificationService.requestAddressMobileOtp(req.user!.id, req.params.id, requestMeta(req)),
  );
});

export const confirmAddressMobileOtpHandler = asyncHandler(async (req: Request, res) => {
  return sendSuccess(
    res,
    await addressVerificationService.confirmAddressMobileOtp(
      req.user!.id,
      req.params.id,
      req.body.code,
      requestMeta(req),
    ),
  );
});
