import type { Role } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { ConflictError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import { buildExcelBuffer } from '../../utils/excel.util';
import type { ListQuery } from '../../utils/pagination';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { BatchModel } from '../inventory/models/batch.model';
import { WarehouseModel } from '../inventory/models/warehouse.model';
import { InvoiceModel } from '../invoices/models/invoice.model';
import { OrderModel } from '../orders/models/order.model';

import { sellerRepository } from './seller.repository';

interface Actor {
  id: string;
  role?: Role;
}

/** Small wrapper so every seller-management audit row consistently carries actor-context (Prompt 10 Part 4/Prompt 11 Part 14) without every call site re-deriving `actorType`. */
function auditSellerChange(
  actor: Actor,
  action: 'create' | 'update' | 'delete',
  sellerId: string,
  before?: unknown,
  after?: unknown,
) {
  return recordAudit({
    actorId: actor.id,
    actorType: actor.role ? actorTypeForRole(actor.role) : undefined,
    action,
    resource: 'seller',
    resourceId: sellerId,
    before,
    after,
  });
}

interface CreateSellerInput {
  legalName: string;
  gstin: string;
  drugLicenseNumber: string;
  enabled?: boolean;
  address?: string;
  invoiceCode?: string;
}

export async function createSeller(input: CreateSellerInput, actor: Actor) {
  const gstin = input.gstin.toUpperCase();
  if (await sellerRepository.findByGstin(gstin)) {
    throw new ConflictError(`A seller with GSTIN "${gstin}" already exists`);
  }

  const seller = await sellerRepository.create({ ...input, gstin, createdBy: actor.id });
  await auditSellerChange(actor, 'create', String((seller as { _id: unknown })._id), null, {
    legalName: input.legalName,
    gstin,
    enabled: input.enabled ?? true,
  });
  return seller;
}

export async function updateSeller(
  id: string,
  input: Partial<CreateSellerInput>,
  actor: Actor,
) {
  const before = await sellerRepository.findById(id);
  if (!before) throw new NotFoundError('Seller');

  const patch: Record<string, unknown> = { ...input, updatedBy: actor.id };
  if (input.gstin) {
    const gstin = input.gstin.toUpperCase();
    const existing = await sellerRepository.findByGstin(gstin);
    if (existing && String((existing as { _id: unknown })._id) !== id) {
      throw new ConflictError(`A seller with GSTIN "${gstin}" already exists`);
    }
    patch.gstin = gstin;
  }

  const updated = await sellerRepository.updateById(id, patch);
  if (!updated) throw new NotFoundError('Seller');

  await auditSellerChange(
    actor,
    'update',
    id,
    { legalName: before.legalName, gstin: before.gstin, drugLicenseNumber: before.drugLicenseNumber },
    { legalName: updated.legalName, gstin: updated.gstin, drugLicenseNumber: updated.drugLicenseNumber },
  );
  return updated;
}

/**
 * Dedicated enable/disable endpoint (Part 10's `seller.enable`/`seller.disable`,
 * mapped onto the existing `sellers:update` permission — see seller.routes.ts)
 * — kept separate from the generic update so the audit trail records a clean
 * "SUPER_ADMIN disabled Seller X" event distinct from an ordinary field edit,
 * and so the frontend's Enable/Disable action doesn't need to resend the
 * whole form. Disabling a seller does NOT cascade to its existing warehouses
 * (that would silently alter operational state); it only blocks NEW
 * operational warehouse creation for that seller (see warehouse.service.ts).
 */
export async function updateSellerStatus(id: string, enabled: boolean, actor: Actor) {
  const before = await sellerRepository.findById(id);
  if (!before) throw new NotFoundError('Seller');

  const updated = await sellerRepository.updateById(id, { enabled, updatedBy: actor.id });
  if (!updated) throw new NotFoundError('Seller');

  await auditSellerChange(actor, 'update', id, { enabled: before.enabled }, { enabled });
  return updated;
}

/**
 * Never hard-deletes (BaseRepository.softDeleteById only — auditPlugin's
 * `deletedAt`). Additionally refuses the soft-delete entirely while any
 * non-deleted Warehouse still references this seller, so historical
 * Orders/Invoices reachable through that warehouse's inventory never end up
 * pointing at a vanished seller — the admin must reassign/remove those
 * warehouses first (Part 4: "reject the operation rather than silently
 * changing historical data").
 */
export async function deleteSeller(id: string, actor: Actor) {
  const warehouseCount = await WarehouseModel.countDocuments({ sellerId: id, deletedAt: null });
  if (warehouseCount > 0) {
    throw new UnprocessableEntityError(
      `Cannot delete this seller — ${warehouseCount} warehouse(s) are still assigned to it. Reassign or remove them first.`,
    );
  }

  const deleted = await sellerRepository.softDeleteById(id, actor.id);
  if (!deleted) throw new NotFoundError('Seller');
  await auditSellerChange(actor, 'delete', id);
}

export async function getSellerById(id: string) {
  const seller = await sellerRepository.findById(id);
  if (!seller) throw new NotFoundError('Seller');
  return seller;
}

export function listSellers(query: ListQuery) {
  return sellerRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}

export async function bulkDeleteSellers(ids: string[], actor: Actor) {
  const blocked: string[] = [];
  const deletable: string[] = [];
  for (const id of ids) {
    const count = await WarehouseModel.countDocuments({ sellerId: id, deletedAt: null });
    (count > 0 ? blocked : deletable).push(id);
  }
  const result = deletable.length
    ? await sellerRepository.bulkSoftDelete(deletable, actor.id)
    : { modifiedCount: 0 };
  return {
    requested: ids.length,
    succeeded: result.modifiedCount,
    failed: ids.length - result.modifiedCount,
  };
}

export async function bulkEditSellers(ids: string[], patch: Record<string, unknown>, actor: Actor) {
  const result = await sellerRepository.bulkUpdate(ids, { ...patch, updatedBy: actor.id });
  return {
    requested: ids.length,
    succeeded: result.modifiedCount,
    failed: ids.length - result.modifiedCount,
  };
}

export function listSellerWarehouses(sellerId: string, query: ListQuery) {
  return WarehouseModel.find({ ...query.filter, sellerId })
    .sort({ createdAt: -1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit)
    .lean();
}

/**
 * Cross-module read-only rollup (Part 16 — "prepare existing reporting
 * queries so future reports can filter by Seller", surfaced now as the
 * Seller detail view's Order/Inventory/Invoice summary). Does not duplicate
 * any existing reporting infrastructure — just scoped counts/sums via the
 * seller's warehouse set (inventory) and `sellerId` (orders/invoices).
 */
export async function getSellerSummary(sellerId: string) {
  const seller = await sellerRepository.findById(sellerId);
  if (!seller) throw new NotFoundError('Seller');

  const warehouses = await WarehouseModel.find({ sellerId, deletedAt: null }).select('_id').lean();
  const warehouseIds = warehouses.map((w) => w._id);

  const [orderStats, invoiceStats, inventoryStats] = await Promise.all([
    OrderModel.aggregate([
      { $match: { sellerId: new mongoose.Types.ObjectId(sellerId) } },
      { $group: { _id: null, count: { $sum: 1 }, totalValue: { $sum: '$totals.grandTotal' } } },
    ]),
    InvoiceModel.aggregate([
      { $match: { sellerId: new mongoose.Types.ObjectId(sellerId) } },
      { $group: { _id: null, count: { $sum: 1 }, totalValue: { $sum: '$totals.grandTotal' } } },
    ]),
    warehouseIds.length
      ? BatchModel.aggregate([
          { $match: { warehouseId: { $in: warehouseIds }, deletedAt: null } },
          { $group: { _id: null, batchCount: { $sum: 1 }, totalUnits: { $sum: '$quantityAvailable' } } },
        ])
      : Promise.resolve([]),
  ]);

  return {
    warehouseCount: warehouseIds.length,
    orders: { count: orderStats[0]?.count ?? 0, totalValue: orderStats[0]?.totalValue ?? 0 },
    invoices: { count: invoiceStats[0]?.count ?? 0, totalValue: invoiceStats[0]?.totalValue ?? 0 },
    inventory: {
      batchCount: inventoryStats[0]?.batchCount ?? 0,
      totalUnits: inventoryStats[0]?.totalUnits ?? 0,
    },
  };
}

export async function exportSellersToExcel(): Promise<Buffer> {
  const { items } = await sellerRepository.paginate({}, { limit: 10000, sort: '-createdAt' });
  return buildExcelBuffer(
    'Sellers',
    [
      { header: 'Legal Name', key: 'legalName', width: 28 },
      { header: 'GSTIN', key: 'gstin', width: 18 },
      { header: 'Drug License No.', key: 'drugLicenseNumber', width: 22 },
      { header: 'Enabled', key: 'enabled', width: 10 },
    ],
    items,
  );
}
