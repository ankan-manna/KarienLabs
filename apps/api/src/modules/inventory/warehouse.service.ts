import type { Role } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { ConflictError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { sellerRepository } from '../sellers/seller.repository';

import { StockTransferModel } from './models/stock-transfer.model';
import { warehouseRepository } from './warehouse.repository';

interface CreateWarehouseInput {
  name: string;
  code: string;
  sellerId: string;
  [key: string]: unknown;
}

/** Shared by create/transfer — Part 4: "Warehouse cannot reference a non-existing Seller" + "Disabled Seller cannot receive new operational warehouse activity". */
async function assertSellerCanReceiveWarehouse(sellerId: string): Promise<void> {
  const seller = await sellerRepository.findById(sellerId);
  if (!seller) throw new NotFoundError('Seller');
  if (!seller.enabled) {
    throw new UnprocessableEntityError(
      'This seller is disabled and cannot be assigned new operational warehouses.',
    );
  }
}

export async function createWarehouse(input: CreateWarehouseInput, actorId: string) {
  const code = input.code.toUpperCase();
  if (await warehouseRepository.findByCode(code))
    throw new ConflictError(`Warehouse code "${code}" already exists`);

  await assertSellerCanReceiveWarehouse(input.sellerId);

  return warehouseRepository.create({ ...input, code, createdBy: actorId });
}

export async function updateWarehouse(
  id: string,
  input: Partial<CreateWarehouseInput>,
  actorId: string,
) {
  // `sellerId` is stripped by the Zod schema already (see warehouse.validator.ts),
  // but guard here too in case this service is ever called directly —
  // ownership changes must go through `transferWarehouseSeller` only.
  const patch = { ...input, updatedBy: actorId } as Record<string, unknown>;
  delete patch.sellerId;
  if (input.code) patch.code = input.code.toUpperCase();
  const updated = await warehouseRepository.updateById(id, patch);
  if (!updated) throw new NotFoundError('Warehouse');
  return updated;
}

/**
 * Explicit, audited ownership-transfer path (Part 4: "Warehouse cannot
 * silently change ownership"). Requires a `reason` and records a distinct
 * before/after audit row — the generic `updateWarehouse` above can never
 * touch `sellerId` at all. Does not retroactively touch any Order/Invoice
 * already attributed to the warehouse's previous seller (Part 4: "Historical
 * orders/invoices remain linked to the original Seller") since those store
 * `sellerId` directly at the time they were created, not derived from the
 * warehouse's current owner.
 */
export async function transferWarehouseSeller(
  id: string,
  newSellerId: string,
  reason: string,
  actorId: string,
  actorRole?: Role,
) {
  const warehouse = await warehouseRepository.findById(id);
  if (!warehouse) throw new NotFoundError('Warehouse');

  const previousSellerId = (warehouse as { sellerId?: unknown }).sellerId ?? null;
  if (previousSellerId && String(previousSellerId) === newSellerId) {
    throw new ConflictError('Warehouse already belongs to this seller');
  }

  await assertSellerCanReceiveWarehouse(newSellerId);

  const updated = await warehouseRepository.updateById(id, {
    sellerId: newSellerId,
    updatedBy: actorId,
  });
  if (!updated) throw new NotFoundError('Warehouse');

  await recordAudit({
    actorId,
    actorType: actorRole ? actorTypeForRole(actorRole) : undefined,
    action: 'update',
    resource: 'warehouse',
    resourceId: id,
    before: { sellerId: previousSellerId ? String(previousSellerId) : null },
    after: { sellerId: newSellerId },
    metadata: { reason, operation: 'transfer_seller' },
  });

  return updated;
}

export async function deleteWarehouse(id: string, actorId: string) {
  const deleted = await warehouseRepository.softDeleteById(id, actorId);
  if (!deleted) throw new NotFoundError('Warehouse');
}

export async function getWarehouseById(id: string) {
  const warehouse = await warehouseRepository.findById(id);
  if (!warehouse) throw new NotFoundError('Warehouse');
  return warehouse;
}

export function listWarehouses(query: ListQuery) {
  return warehouseRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}

interface DirectionSummary {
  totalQuantity: number;
  totalCount: number;
  byStatus: { status: string; quantity: number; count: number }[];
}

/**
 * Aggregates StockTransfer records where this warehouse is either the source
 * ("out") or destination ("in"), grouped by direction and status, with totals.
 */
export async function getWarehouseTransferReport(warehouseId: string) {
  const warehouse = await warehouseRepository.findById(warehouseId);
  if (!warehouse) throw new NotFoundError('Warehouse');

  const objectId = new mongoose.Types.ObjectId(warehouseId);
  const rows = await StockTransferModel.aggregate([
    {
      $match: {
        deletedAt: null,
        $or: [{ fromWarehouseId: objectId }, { toWarehouseId: objectId }],
      },
    },
    {
      $addFields: {
        direction: { $cond: [{ $eq: ['$toWarehouseId', objectId] }, 'in', 'out'] },
      },
    },
    {
      $group: {
        _id: { direction: '$direction', status: '$status' },
        quantity: { $sum: '$quantity' },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.direction',
        totalQuantity: { $sum: '$quantity' },
        totalCount: { $sum: '$count' },
        byStatus: { $push: { status: '$_id.status', quantity: '$quantity', count: '$count' } },
      },
    },
  ]);

  const emptySummary = (): DirectionSummary => ({ totalQuantity: 0, totalCount: 0, byStatus: [] });
  const summary: { in: DirectionSummary; out: DirectionSummary } = {
    in: emptySummary(),
    out: emptySummary(),
  };

  for (const row of rows as { _id: 'in' | 'out'; totalQuantity: number; totalCount: number; byStatus: DirectionSummary['byStatus'] }[]) {
    if (row._id === 'in' || row._id === 'out') {
      summary[row._id] = {
        totalQuantity: row.totalQuantity,
        totalCount: row.totalCount,
        byStatus: row.byStatus,
      };
    }
  }

  return {
    warehouseId,
    warehouseName: (warehouse as { name?: string }).name ?? '',
    ...summary,
    netQuantity: summary.in.totalQuantity - summary.out.totalQuantity,
  };
}
