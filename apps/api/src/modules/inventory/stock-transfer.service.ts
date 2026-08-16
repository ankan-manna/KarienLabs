import { STOCK_MOVEMENT_TYPES, STOCK_TRANSFER_STATUS } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';

import { BatchModel } from './models/batch.model';
import { StockMovementModel } from './models/stock-movement.model';
import { StockTransferModel } from './models/stock-transfer.model';
import { stockTransferRepository } from './stock-transfer.repository';

interface RequestTransferInput {
  batchId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
}

export async function requestStockTransfer(input: RequestTransferInput, actorId: string) {
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new UnprocessableEntityError('Source and destination warehouse must differ');
  }
  const batch = await BatchModel.findById(input.batchId).lean();
  if (!batch) throw new NotFoundError('Batch');
  if (batch.quantityAvailable < input.quantity) {
    throw new UnprocessableEntityError('Transfer quantity exceeds available stock in source batch');
  }

  return stockTransferRepository.create({
    batchId: input.batchId,
    fromWarehouseId: input.fromWarehouseId,
    toWarehouseId: input.toWarehouseId,
    quantity: input.quantity,
    status: STOCK_TRANSFER_STATUS.PENDING,
    requestedBy: actorId,
    createdBy: actorId,
  });
}

export function listStockTransfers(query: ListQuery) {
  return stockTransferRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}

export async function getStockTransferById(id: string) {
  const transfer = await stockTransferRepository.findById(id);
  if (!transfer) throw new NotFoundError('Stock transfer');
  return transfer;
}

/** Receiving is the only path that actually moves stock — deducts the source batch, upserts the destination batch, and logs the paired transfer_out/transfer_in ledger entries atomically. */
export async function receiveStockTransfer(id: string, actorId: string) {
  const transfer = await StockTransferModel.findById(id);
  if (!transfer) throw new NotFoundError('Stock transfer');
  if (transfer.status !== STOCK_TRANSFER_STATUS.PENDING && transfer.status !== STOCK_TRANSFER_STATUS.IN_TRANSIT) {
    throw new UnprocessableEntityError(`Transfer is already "${transfer.status}"`);
  }

  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const sourceBatch = await BatchModel.findById(transfer.batchId).session(session);
      if (!sourceBatch) throw new NotFoundError('Batch');

      const sourceNewAvailable = sourceBatch.quantityAvailable - transfer.quantity;
      if (sourceNewAvailable < 0) {
        throw new UnprocessableEntityError('Transfer quantity exceeds current available stock');
      }
      sourceBatch.quantityAvailable = sourceNewAvailable;
      await sourceBatch.save({ session });

      let destBatch = await BatchModel.findOne({
        productId: sourceBatch.productId,
        warehouseId: transfer.toWarehouseId,
        batchNumber: sourceBatch.batchNumber,
      }).session(session);

      let destNewAvailable: number;
      if (destBatch) {
        destNewAvailable = destBatch.quantityAvailable + transfer.quantity;
        destBatch.quantityAvailable = destNewAvailable;
        destBatch.quantityReceived += transfer.quantity;
        await destBatch.save({ session });
      } else {
        destNewAvailable = transfer.quantity;
        const created = await BatchModel.create(
          [
            {
              productId: sourceBatch.productId,
              variantId: sourceBatch.variantId,
              warehouseId: transfer.toWarehouseId,
              batchNumber: sourceBatch.batchNumber,
              mfgDate: sourceBatch.mfgDate,
              expiryDate: sourceBatch.expiryDate,
              quantityReceived: transfer.quantity,
              quantityAvailable: transfer.quantity,
              unitCost: sourceBatch.unitCost,
              supplierId: sourceBatch.supplierId,
            },
          ],
          { session },
        );
        destBatch = created[0];
      }

      await StockMovementModel.create(
        [
          {
            batchId: sourceBatch._id,
            warehouseId: transfer.fromWarehouseId,
            type: STOCK_MOVEMENT_TYPES.TRANSFER_OUT,
            quantity: -transfer.quantity,
            balanceAfter: sourceNewAvailable,
            referenceType: 'stock_transfer',
            referenceId: transfer._id,
            performedBy: actorId,
            notes: `Transfer to warehouse ${String(transfer.toWarehouseId)}`,
          },
          {
            batchId: destBatch._id,
            warehouseId: transfer.toWarehouseId,
            type: STOCK_MOVEMENT_TYPES.TRANSFER_IN,
            quantity: transfer.quantity,
            balanceAfter: destNewAvailable,
            referenceType: 'stock_transfer',
            referenceId: transfer._id,
            performedBy: actorId,
            notes: `Transfer from warehouse ${String(transfer.fromWarehouseId)}`,
          },
        ],
        { session, ordered: true },
      );

      transfer.status = STOCK_TRANSFER_STATUS.RECEIVED;
      transfer.receivedBy = new mongoose.Types.ObjectId(actorId);
      transfer.receivedAt = new Date();
      await transfer.save({ session });

      return transfer;
    });
  } finally {
    await session.endSession();
  }
}

export async function cancelStockTransfer(id: string, actorId: string) {
  const transfer = await StockTransferModel.findById(id);
  if (!transfer) throw new NotFoundError('Stock transfer');
  if (transfer.status !== STOCK_TRANSFER_STATUS.PENDING) {
    throw new UnprocessableEntityError('Only a pending transfer can be cancelled');
  }
  transfer.status = STOCK_TRANSFER_STATUS.CANCELLED;
  transfer.set('updatedBy', actorId);
  await transfer.save();
  return transfer;
}
