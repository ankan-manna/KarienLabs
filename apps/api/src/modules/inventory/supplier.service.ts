import mongoose from 'mongoose';

import { NotFoundError } from '../../utils/app-error';
import { buildExcelBuffer } from '../../utils/excel.util';
import type { ListQuery } from '../../utils/pagination';

import { PurchaseOrderModel } from './models/purchase-order.model';
import { supplierRepository } from './supplier.repository';

export async function createSupplier(input: Record<string, unknown>, actorId: string) {
  return supplierRepository.create({ ...input, createdBy: actorId });
}

export async function updateSupplier(id: string, input: Record<string, unknown>, actorId: string) {
  const updated = await supplierRepository.updateById(id, { ...input, updatedBy: actorId });
  if (!updated) throw new NotFoundError('Supplier');
  return updated;
}

export async function deleteSupplier(id: string, actorId: string) {
  const deleted = await supplierRepository.softDeleteById(id, actorId);
  if (!deleted) throw new NotFoundError('Supplier');
}

export async function getSupplierById(id: string) {
  const supplier = await supplierRepository.findById(id);
  if (!supplier) throw new NotFoundError('Supplier');
  return supplier;
}

export function listSuppliers(query: ListQuery) {
  return supplierRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}

export async function bulkDeleteSuppliers(ids: string[], actorId: string) {
  const result = await supplierRepository.bulkSoftDelete(ids, actorId);
  return {
    requested: ids.length,
    succeeded: result.modifiedCount,
    failed: ids.length - result.modifiedCount,
  };
}

export async function bulkEditSuppliers(
  ids: string[],
  patch: Record<string, unknown>,
  actorId: string,
) {
  const result = await supplierRepository.bulkUpdate(ids, { ...patch, updatedBy: actorId });
  return {
    requested: ids.length,
    succeeded: result.modifiedCount,
    failed: ids.length - result.modifiedCount,
  };
}

/**
 * All PurchaseOrders raised against this supplier, newest first, plus summary
 * stats (order value is derived from line items since PurchaseOrder has no
 * stored total).
 */
export async function getSupplierPurchaseHistory(supplierId: string, query: ListQuery) {
  const supplier = await supplierRepository.findById(supplierId);
  if (!supplier) throw new NotFoundError('Supplier');

  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;
  const filter = { supplierId, deletedAt: null };

  const [items, total, summaryRows] = await Promise.all([
    PurchaseOrderModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PurchaseOrderModel.countDocuments(filter),
    PurchaseOrderModel.aggregate([
      { $match: { supplierId: new mongoose.Types.ObjectId(supplierId), deletedAt: null } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$_id',
          orderValue: { $sum: { $multiply: ['$items.quantityOrdered', '$items.unitCost'] } },
        },
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalValue: { $sum: '$orderValue' },
        },
      },
    ]),
  ]);

  const totalOrders: number = summaryRows[0]?.totalOrders ?? 0;
  const totalValue: number = summaryRows[0]?.totalValue ?? 0;
  const averageOrderValue = totalOrders > 0 ? totalValue / totalOrders : 0;

  return {
    items,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    summary: { totalOrders, totalValue, averageOrderValue },
  };
}

export async function exportSuppliersToExcel(): Promise<Buffer> {
  const { items } = await supplierRepository.paginate({}, { limit: 10000, sort: '-createdAt' });
  return buildExcelBuffer(
    'Suppliers',
    [
      { header: 'Name', key: 'name', width: 24 },
      { header: 'GSTIN', key: 'gstin', width: 18 },
      { header: 'Contact Person', key: 'contactPerson', width: 22 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Active', key: 'isActive', width: 10 },
    ],
    items,
  );
}
