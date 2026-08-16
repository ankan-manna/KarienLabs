import { invalidateBlockedIpCache } from '../../middlewares/blocked-ip.middleware';
import { ConflictError, NotFoundError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { parseSort } from '../../utils/pagination';
import { DeviceModel } from '../auth/models/device.model';

import { BlockedIpModel } from './models/blocked-ip.model';

interface PaginatedResult<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export async function listBlockedIps(query: ListQuery): Promise<PaginatedResult<unknown>> {
  const { page, limit, filter, sort } = query;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    BlockedIpModel.find(filter)
      .sort(parseSort(sort) ?? { createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('blockedBy', 'name email')
      .lean(),
    BlockedIpModel.countDocuments(filter),
  ]);

  return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function blockIp(input: { ipAddress: string; reason?: string }, actorId: string) {
  const existing = await BlockedIpModel.findOne({ ipAddress: input.ipAddress }).lean();
  if (existing) throw new ConflictError('This IP address is already blocked');

  const blocked = await BlockedIpModel.create({
    ipAddress: input.ipAddress,
    reason: input.reason ?? '',
    blockedBy: actorId,
  });
  await invalidateBlockedIpCache(input.ipAddress);
  return blocked;
}

export async function unblockIp(id: string) {
  const removed = await BlockedIpModel.findByIdAndDelete(id).lean();
  if (!removed) throw new NotFoundError('Blocked IP');
  await invalidateBlockedIpCache(removed.ipAddress);
  return removed;
}

export async function listDevices(query: ListQuery): Promise<PaginatedResult<unknown>> {
  const { page, limit, filter, sort } = query;
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    DeviceModel.find(filter)
      .sort(parseSort(sort) ?? { lastActiveAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'name email')
      .lean(),
    DeviceModel.countDocuments(filter),
  ]);

  return { items, meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function blockDevice(id: string, reason?: string) {
  const device = await DeviceModel.findByIdAndUpdate(
    id,
    { isBlocked: true, blockedReason: reason ?? '' },
    { new: true },
  ).lean();
  if (!device) throw new NotFoundError('Device');
  return device;
}

export async function unblockDevice(id: string) {
  const device = await DeviceModel.findByIdAndUpdate(
    id,
    { isBlocked: false, blockedReason: '' },
    { new: true },
  ).lean();
  if (!device) throw new NotFoundError('Device');
  return device;
}
