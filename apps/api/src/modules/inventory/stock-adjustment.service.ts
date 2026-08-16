import { CATALOG_AUDIT_ACTIONS, STOCK_ADJUSTMENT_STATUS, STOCK_MOVEMENT_TYPES } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { logger } from '../../config/logger';
import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { recordAudit } from '../audit/audit.service';
import { ProductVariantModel } from '../catalog/models/product-variant.model';
import { ProductModel } from '../catalog/models/product.model';
import { publishInventoryUpdate } from '../realtime/inventory-events';

import { BatchModel } from './models/batch.model';
import { StockAdjustmentModel } from './models/stock-adjustment.model';
import { StockMovementModel } from './models/stock-movement.model';
import { WarehouseModel } from './models/warehouse.model';
import { stockAdjustmentRepository } from './stock-adjustment.repository';

interface CreateAdjustmentInput {
  batchId: string;
  warehouseId: string;
  quantityDelta: number;
  reason: string;
}

export async function requestStockAdjustment(input: CreateAdjustmentInput, actorId: string) {
  return stockAdjustmentRepository.create({
    ...input,
    status: STOCK_ADJUSTMENT_STATUS.PENDING,
    requestedBy: actorId,
    createdBy: actorId,
  });
}

export async function getStockAdjustmentById(id: string) {
  const adjustment = await stockAdjustmentRepository.findById(id);
  if (!adjustment) throw new NotFoundError('Stock adjustment');
  return adjustment;
}

export function listStockAdjustments(query: ListQuery) {
  return stockAdjustmentRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}

/** Approval is the only path that actually moves stock — applied atomically alongside the resulting StockMovement ledger entry. */
export async function approveStockAdjustment(id: string, actorId: string) {
  const adjustment = await StockAdjustmentModel.findById(id);
  if (!adjustment) throw new NotFoundError('Stock adjustment');
  if (adjustment.status !== STOCK_ADJUSTMENT_STATUS.PENDING) {
    throw new UnprocessableEntityError(`Adjustment is already "${adjustment.status}"`);
  }

  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const batch = await BatchModel.findById(adjustment.batchId).session(session);
      if (!batch) throw new NotFoundError('Batch');

      const newAvailable = batch.quantityAvailable + adjustment.quantityDelta;
      if (newAvailable < 0) {
        throw new UnprocessableEntityError('Adjustment would result in negative available stock');
      }

      batch.quantityAvailable = newAvailable;
      await batch.save({ session });

      await StockMovementModel.create(
        [
          {
            batchId: batch._id,
            warehouseId: adjustment.warehouseId,
            type: STOCK_MOVEMENT_TYPES.ADJUSTMENT,
            quantity: adjustment.quantityDelta,
            balanceAfter: newAvailable,
            referenceType: 'stock_adjustment',
            referenceId: adjustment._id,
            performedBy: actorId,
            notes: adjustment.reason,
          },
        ],
        { session },
      );

      adjustment.status = STOCK_ADJUSTMENT_STATUS.APPROVED;
      adjustment.approvedBy = new mongoose.Types.ObjectId(actorId);
      adjustment.approvedAt = new Date();
      await adjustment.save({ session });

      return adjustment;
    });
  } finally {
    await session.endSession();
  }
}

type QuickAddStockInput =
  | { mode: 'existing_batch'; batchId: string; quantity: number; reason?: string }
  | {
      mode: 'new_batch';
      productId: string;
      warehouseId: string;
      variantId?: string | null;
      batchNumber: string;
      mfgDate?: Date;
      expiryDate: Date;
      unitCost?: number;
      mrp?: number;
      quantity: number;
      reason?: string;
    };

/**
 * Prompt (Admin Inventory Management) Part 12-19 — "Add Inventory": a
 * single-step counterpart to the request→approve workflow above, for the
 * common case of an admin who already holds both `inventory:update` (this
 * route's own gate) and, in practice, `inventory:approve` too (every seeded
 * role that has one has the other — see seed-roles.ts). Reuses the exact
 * same models (Batch/StockAdjustment/StockMovement) and the exact same
 * load-in-transaction-then-save pattern as `approveStockAdjustment` above
 * (Part 18/38: no new atomic-update mechanism, no duplicate architecture) —
 * `session.withTransaction()` already retries on a concurrent write
 * conflict, so two simultaneous calls against the same batch still commit
 * as 10+5+7=22, never a lost update. The StockAdjustment row is written
 * already `APPROVED` (never `PENDING`) so this never becomes a second,
 * parallel adjustment queue — it's the same audit trail, just created and
 * approved in one step instead of two.
 *
 * Prompt (Manufacturer Inventory Model) — `mode: 'new_batch'` is the
 * PO/GRN-free path for KarienLabs' own manufactured stock: it creates the
 * Batch itself (the exact same atomic upsert `grn.service.ts::createGrn`
 * already uses — `$inc` the quantity fields, `$setOnInsert` the
 * batch-identity fields, so a race against a second call for the SAME
 * (product, warehouse, batchNumber) can never double-create or lose an
 * update) with `supplierId`/`purchaseOrderId` left `null` (both already
 * optional on the Batch schema — nothing there required a PO, only
 * `createGrn` being the sole caller that ever inserted a Batch did). No
 * second "manufacturing inventory" ledger — this writes into the exact same
 * Batch/StockMovement collections a GRN receipt or the existing-batch path
 * above does, just tagged `STOCK_MOVEMENT_TYPES.MANUFACTURED` instead of
 * `RECEIPT`/`ADJUSTMENT` so the source stays distinguishable in reports.
 */
export async function quickAddStock(input: QuickAddStockInput, actorId: string) {
  const session = await mongoose.startSession();
  try {
    const { batch, adjustment, previousAvailable, newlyCreatedBatch } = await session.withTransaction(
      async () => {
        let batch;
        let newlyCreatedBatch: { productId: string; warehouseId: string; batchNumber: string; expiryDate: Date; mrp: number | null } | null = null;

        if (input.mode === 'existing_batch') {
          batch = await BatchModel.findById(input.batchId).session(session);
          if (!batch) throw new NotFoundError('Batch');
          batch.quantityAvailable = batch.quantityAvailable + input.quantity;
          await batch.save({ session });
        } else {
          const product = await ProductModel.findOne({ _id: input.productId, deletedAt: null })
            .select('_id')
            .session(session);
          if (!product) throw new NotFoundError('Product');

          const warehouse = await WarehouseModel.findById(input.warehouseId).session(session);
          if (!warehouse) throw new NotFoundError('Warehouse');

          if (input.variantId) {
            const variant = await ProductVariantModel.findOne({
              _id: input.variantId,
              productId: input.productId,
            }).session(session);
            if (!variant) {
              throw new UnprocessableEntityError('Selected SKU does not belong to the selected product');
            }
          }

          const existedBefore = await BatchModel.exists({
            productId: input.productId,
            warehouseId: input.warehouseId,
            batchNumber: input.batchNumber,
          }).session(session);

          batch = await BatchModel.findOneAndUpdate(
            {
              productId: input.productId,
              warehouseId: input.warehouseId,
              batchNumber: input.batchNumber,
            },
            {
              $inc: { quantityReceived: input.quantity, quantityAvailable: input.quantity },
              $setOnInsert: {
                productId: input.productId,
                variantId: input.variantId ?? null,
                warehouseId: input.warehouseId,
                batchNumber: input.batchNumber,
                mfgDate: input.mfgDate ?? null,
                expiryDate: input.expiryDate,
                unitCost: input.unitCost ?? 0,
                mrp: input.mrp ?? null,
                supplierId: null,
                purchaseOrderId: null,
              },
            },
            { upsert: true, new: true, session },
          );

          if (!existedBefore) {
            newlyCreatedBatch = {
              productId: input.productId,
              warehouseId: input.warehouseId,
              batchNumber: input.batchNumber,
              expiryDate: input.expiryDate,
              mrp: input.mrp ?? null,
            };
          }
        }

        // Correct in both branches: for an existing batch this is simply the
        // pre-increment value; for an upserted-new one `$inc` treats the
        // missing doc as starting at 0, so `newAvailable - quantity` is 0 —
        // exactly right, without a second read to fetch a "before" snapshot.
        const previousAvailable = batch.quantityAvailable - input.quantity;

        const defaultReason =
          input.mode === 'new_batch' ? 'Manufactured stock' : 'Manual stock addition';

        const [adjustment] = await StockAdjustmentModel.create(
          [
            {
              batchId: batch._id,
              warehouseId: batch.warehouseId,
              quantityDelta: input.quantity,
              reason: input.reason?.trim() || defaultReason,
              status: STOCK_ADJUSTMENT_STATUS.APPROVED,
              requestedBy: actorId,
              approvedBy: actorId,
              approvedAt: new Date(),
              createdBy: actorId,
            },
          ],
          { session },
        );

        await StockMovementModel.create(
          [
            {
              batchId: batch._id,
              warehouseId: batch.warehouseId,
              type:
                input.mode === 'new_batch'
                  ? STOCK_MOVEMENT_TYPES.MANUFACTURED
                  : STOCK_MOVEMENT_TYPES.ADJUSTMENT,
              quantity: input.quantity,
              balanceAfter: batch.quantityAvailable,
              referenceType: 'stock_adjustment',
              referenceId: adjustment._id,
              performedBy: actorId,
              notes: adjustment.reason,
            },
          ],
          { session },
        );

        return { batch, adjustment, previousAvailable, newlyCreatedBatch };
      },
    );

    // Part 20 — "customer UI must reflect updated availability." Fired only
    // AFTER the transaction has committed (never from inside it — the same
    // rule order.service.ts's own call already follows), and deliberately
    // not awaited: `publishInventoryUpdate` already swallows its own errors
    // (a Redis hiccup must not fail a stock addition that already
    // succeeded in the database, which remains the source of truth).
    void publishInventoryUpdate([String(batch.productId)]);

    // Bugfix (Human-Readable API Logging) Part 12/13 — connects this
    // function back to Prompt 1 (Manufacturer Inventory Model): distinct
    // `operation` per STOCK_MOVEMENT_TYPES branch above (MANUFACTURED_STOCK
    // for the PO-free `new_batch` mode, STOCK_ADJUSTMENT for a manual
    // addition to an existing batch) so a developer can grep logs for
    // exactly one kind of stock event. SKU resolved AFTER commit — a
    // best-effort lookup for log context only, never allowed to fail or
    // delay the already-committed stock addition.
    const skuDoc = batch.variantId
      ? await ProductVariantModel.findById(batch.variantId).select('sku').lean()
      : await ProductModel.findById(batch.productId).select('sku').lean();
    logger.info(
      {
        actorId,
        operation: input.mode === 'new_batch' ? 'MANUFACTURED_STOCK' : 'STOCK_ADJUSTMENT',
        productId: String(batch.productId),
        sku: skuDoc?.sku ?? null,
        batchId: String(batch._id),
        quantityAdded: input.quantity,
        previousStock: previousAvailable,
        newStock: batch.quantityAvailable,
      },
      'Inventory stock added',
    );

    // Same "audit AFTER commit" rule createGrn already follows — a rolled-
    // back transaction must never leave behind an audit row for a batch
    // that was never actually created.
    if (newlyCreatedBatch) {
      await recordAudit({
        actorId,
        action: CATALOG_AUDIT_ACTIONS.ADMIN_CREATED_BATCH,
        resource: 'batch',
        resourceId: String(batch._id),
        after: newlyCreatedBatch,
      });
    }

    return { batch, adjustment, previousAvailable };
  } finally {
    await session.endSession();
  }
}

export async function rejectStockAdjustment(id: string, actorId: string) {
  const adjustment = await StockAdjustmentModel.findById(id);
  if (!adjustment) throw new NotFoundError('Stock adjustment');
  if (adjustment.status !== STOCK_ADJUSTMENT_STATUS.PENDING) {
    throw new UnprocessableEntityError(`Adjustment is already "${adjustment.status}"`);
  }

  adjustment.status = STOCK_ADJUSTMENT_STATUS.REJECTED;
  adjustment.approvedBy = new mongoose.Types.ObjectId(actorId);
  adjustment.approvedAt = new Date();
  await adjustment.save();
  return adjustment;
}
