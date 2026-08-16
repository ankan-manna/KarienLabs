import { sendCreated, sendPaginated, sendSuccess } from '../../utils/api-response';
import { asyncHandler } from '../../utils/async-handler';
import type { ListQuery } from '../../utils/pagination';

import * as securityService from './security.service';

export const listBlockedIpsHandler = asyncHandler(async (req, res) => {
  const { items, meta } = await securityService.listBlockedIps(req.query as unknown as ListQuery);
  return sendPaginated(res, items, meta);
});

export const blockIpHandler = asyncHandler(async (req, res) => {
  const blocked = await securityService.blockIp(req.body, req.user!.id);
  return sendCreated(res, blocked);
});

export const unblockIpHandler = asyncHandler(async (req, res) => {
  await securityService.unblockIp(req.params.id);
  return sendSuccess(res, { unblocked: true });
});

export const listDevicesHandler = asyncHandler(async (req, res) => {
  const { items, meta } = await securityService.listDevices(req.query as unknown as ListQuery);
  return sendPaginated(res, items, meta);
});

export const blockDeviceHandler = asyncHandler(async (req, res) => {
  const device = await securityService.blockDevice(req.params.id, req.body?.reason);
  return sendSuccess(res, device);
});

export const unblockDeviceHandler = asyncHandler(async (req, res) => {
  const device = await securityService.unblockDevice(req.params.id);
  return sendSuccess(res, device);
});
