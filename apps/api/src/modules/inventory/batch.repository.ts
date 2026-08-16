import mongoose from 'mongoose';

import { BaseRepository } from '../../repositories/base.repository';

import { BatchModel, type BatchDocument } from './models/batch.model';

export class BatchRepository extends BaseRepository<BatchDocument> {
  constructor() {
    super(BatchModel);
  }

  /** Groups available stock per product+warehouse and flags totals at/below the product's reorderLevel. */
  findLowStock() {
    return this.model.aggregate([
      { $match: { deletedAt: null } },
      {
        $group: {
          _id: { productId: '$productId', warehouseId: '$warehouseId' },
          totalAvailable: { $sum: '$quantityAvailable' },
        },
      },
      {
        $lookup: {
          from: 'products',
          localField: '_id.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: '$product' },
      { $match: { $expr: { $lte: ['$totalAvailable', '$product.reorderLevel'] } } },
      {
        $project: {
          _id: 0,
          productId: '$_id.productId',
          warehouseId: '$_id.warehouseId',
          totalAvailable: 1,
          productName: '$product.name',
          sku: '$product.sku',
          reorderLevel: '$product.reorderLevel',
        },
      },
      { $sort: { totalAvailable: 1 } },
    ]);
  }

  findNearExpiry(withinDays: number) {
    const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    return this.model
      .find({ expiryDate: { $lte: cutoff }, quantityAvailable: { $gt: 0 }, deletedAt: null })
      .sort({ expiryDate: 1 })
      .lean();
  }

  /**
   * Prompt 23 Part 8/46 — the ONE authoritative in-stock lookup, batched
   * across many products in a single aggregation (not one query per
   * product — Part 43's "avoid expensive per-product database calls").
   * Extracted from what was previously inline, duplicated ad hoc logic in
   * `product.service.ts::getPublicProductDetail`; now BOTH product detail
   * and search results read from this same function, so "in stock" can
   * never silently disagree between the two surfaces (the exact
   * "second stock value inside SearchService" anti-pattern Part 8
   * explicitly warns against).
   *
   * Prompt 27 (inventory lifecycle) fix — this previously counted a
   * recalled batch's `quantityAvailable` toward "available" even though
   * `order.service.ts::decrementStockFifo` (the actual FEFO picker used at
   * order finalization) explicitly excludes `recallFlag: true` batches from
   * selection. That meant a product could show "in stock" to a customer,
   * be charged for, and then fail at order finalization purely because the
   * only stock backing that number was recalled — a real, silent inventory
   * miscount, not a race condition. `recallFlag: {$ne: true}` now matches
   * `decrementStockFifo`'s own eligibility filter exactly, so this
   * canonical lookup can never report a unit as sellable that finalize-time
   * FEFO would refuse to pick.
   */
  async getAvailableStockMap(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.model.aggregate([
      {
        $match: {
          productId: { $in: productIds.map((id) => new mongoose.Types.ObjectId(id)) },
          deletedAt: null,
          quantityAvailable: { $gt: 0 },
          recallFlag: { $ne: true },
        },
      },
      { $group: { _id: '$productId', total: { $sum: '$quantityAvailable' } } },
    ]);
    return new Map(rows.map((r: { _id: unknown; total: number }) => [String(r._id), r.total]));
  }
}

export const batchRepository = new BatchRepository();
