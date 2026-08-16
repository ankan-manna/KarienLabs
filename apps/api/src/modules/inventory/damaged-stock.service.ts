import { STOCK_MOVEMENT_TYPES } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';

import { damagedStockRepository } from './damaged-stock.repository';
import { BatchModel } from './models/batch.model';
import { DamagedStockModel } from './models/damaged-stock.model';
import { StockMovementModel } from './models/stock-movement.model';

interface ReportDamagedStockInput {
  batchId: string;
  warehouseId: string;
  quantity: number;
  reason: string;
  evidenceImageUrls?: string[];
}

export async function reportDamagedStock(input: ReportDamagedStockInput, actorId: string) {
  return damagedStockRepository.create({
    ...input,
    reportedBy: actorId,
    createdBy: actorId,
  });
}

export function listDamagedStock(query: ListQuery) {
  return damagedStockRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}

export async function getDamagedStockById(id: string) {
  const report = await damagedStockRepository.findById(id);
  if (!report) throw new NotFoundError('Damaged stock report');
  return report;
}

/** Approval is the only path that writes off stock — mirrors stock-adjustment's transactional approve. */
export async function approveDamagedStock(id: string, actorId: string) {
  const report = await DamagedStockModel.findById(id);
  if (!report) throw new NotFoundError('Damaged stock report');
  if (report.approvedAt) throw new UnprocessableEntityError('Report is already approved');

  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const batch = await BatchModel.findById(report.batchId).session(session);
      if (!batch) throw new NotFoundError('Batch');

      const newAvailable = batch.quantityAvailable - report.quantity;
      if (newAvailable < 0) {
        throw new UnprocessableEntityError('Write-off exceeds available stock for this batch');
      }

      batch.quantityAvailable = newAvailable;
      await batch.save({ session });

      await StockMovementModel.create(
        [
          {
            batchId: batch._id,
            warehouseId: report.warehouseId,
            type: STOCK_MOVEMENT_TYPES.DAMAGE,
            quantity: -report.quantity,
            balanceAfter: newAvailable,
            referenceType: 'damaged_stock',
            referenceId: report._id,
            performedBy: actorId,
            notes: report.reason,
          },
        ],
        { session },
      );

      report.approvedBy = new mongoose.Types.ObjectId(actorId);
      report.approvedAt = new Date();
      await report.save({ session });

      return report;
    });
  } finally {
    await session.endSession();
  }
}

/** Dismisses a not-yet-approved report — nothing has touched stock yet, so this is a plain soft-delete. */
export async function dismissDamagedStock(id: string, actorId: string) {
  const report = await DamagedStockModel.findById(id);
  if (!report) throw new NotFoundError('Damaged stock report');
  if (report.approvedAt) throw new UnprocessableEntityError('Cannot dismiss an already-approved report');
  const deleted = await damagedStockRepository.softDeleteById(id, actorId);
  if (!deleted) throw new NotFoundError('Damaged stock report');
}
