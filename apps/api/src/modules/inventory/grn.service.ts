import { CATALOG_AUDIT_ACTIONS, PURCHASE_ORDER_STATUS, STOCK_MOVEMENT_TYPES } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import { generateSequenceNumber } from '../../utils/sequence.util';
import { recordAudit } from '../audit/audit.service';
import { enqueueNotification } from '../notifications/notification.service';

import { BatchModel } from './models/batch.model';
import { GrnModel } from './models/grn.model';
import { PurchaseOrderModel } from './models/purchase-order.model';
import { StockMovementModel } from './models/stock-movement.model';
import { SupplierModel } from './models/supplier.model';

interface GrnReceivedItemInput {
  productId: string;
  variantId?: string | null;
  batchNumber: string;
  mfgDate?: Date;
  expiryDate: Date;
  quantityReceived: number;
  unitCost: number;
  // Prompt 12 (CAT-04) — the MRP printed on this specific pack/print-run,
  // when known at receipt time. Optional; `undefined` leaves batch.mrp unset
  // (falls back to Product.mrp — see batch-pricing.util.ts). Only applied on
  // first receipt of a given (product, warehouse, batchNumber) — see
  // `$setOnInsert` below; re-receiving the same physical batch number never
  // silently overwrites an already-recorded MRP.
  mrp?: number;
}

interface CreateGrnInput {
  purchaseOrderId: string;
  warehouseId: string;
  receivedItems: GrnReceivedItemInput[];
}

/**
 * The one place stock actually enters the system. Runs as a single transaction:
 * creates the GRN record, upserts a Batch per line item (atomic $inc so
 * concurrent receipts of the same batch never race), writes an immutable
 * StockMovement per batch, and rolls the PurchaseOrder's fulfillment status
 * forward — all-or-nothing, so a partial failure can't leave stock counts and
 * the PO's received quantities out of sync.
 */
export async function createGrn(input: CreateGrnInput, actorId: string) {
  const po = await PurchaseOrderModel.findById(input.purchaseOrderId);
  if (!po) throw new NotFoundError('Purchase order');

  if (
    po.status !== PURCHASE_ORDER_STATUS.SENT &&
    po.status !== PURCHASE_ORDER_STATUS.PARTIALLY_RECEIVED
  ) {
    throw new UnprocessableEntityError(
      `Cannot receive goods for a purchase order in "${po.status}" status`,
    );
  }

  const grnNumber = await generateSequenceNumber('grn', 'GRN');
  const session = await mongoose.startSession();

  // Collected inside the transaction, audited after it commits — audit
  // writes aren't part of the transaction's atomicity guarantee (same
  // reasoning as the GRN/notification audit below), so a rolled-back
  // transaction can never leave behind an audit row for a batch that was
  // never actually created.
  const newlyCreatedBatches: {
    batchId: string;
    productId: string;
    warehouseId: string;
    batchNumber: string;
    expiryDate: Date;
    mrp: number | null;
  }[] = [];

  try {
    await session.withTransaction(async () => {
      const [grn] = await GrnModel.create(
        [
          {
            grnNumber,
            purchaseOrderId: po._id,
            warehouseId: input.warehouseId,
            receivedItems: input.receivedItems,
            receivedBy: actorId,
          },
        ],
        { session },
      );

      for (const item of input.receivedItems) {
        // Checked before the upsert (indexed — matches the compound unique
        // index on productId+warehouseId+batchNumber) purely so we know
        // whether to fire an ADMIN_CREATED_BATCH audit row below; the upsert
        // itself is unconditional either way.
        const existedBefore = await BatchModel.exists({
          productId: item.productId,
          warehouseId: input.warehouseId,
          batchNumber: item.batchNumber,
        }).session(session);

        const batch = await BatchModel.findOneAndUpdate(
          {
            productId: item.productId,
            warehouseId: input.warehouseId,
            batchNumber: item.batchNumber,
          },
          {
            $inc: {
              quantityReceived: item.quantityReceived,
              quantityAvailable: item.quantityReceived,
            },
            $setOnInsert: {
              productId: item.productId,
              variantId: item.variantId ?? null,
              warehouseId: input.warehouseId,
              batchNumber: item.batchNumber,
              mfgDate: item.mfgDate ?? null,
              expiryDate: item.expiryDate,
              unitCost: item.unitCost,
              mrp: item.mrp ?? null,
              supplierId: po.supplierId,
              purchaseOrderId: po._id,
            },
          },
          { upsert: true, new: true, session },
        );

        if (!existedBefore) {
          newlyCreatedBatches.push({
            batchId: String(batch._id),
            productId: item.productId,
            warehouseId: input.warehouseId,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            mrp: item.mrp ?? null,
          });
        }

        await StockMovementModel.create(
          [
            {
              batchId: batch._id,
              warehouseId: input.warehouseId,
              type: STOCK_MOVEMENT_TYPES.RECEIPT,
              quantity: item.quantityReceived,
              balanceAfter: batch.quantityAvailable,
              referenceType: 'grn',
              referenceId: grn._id,
              performedBy: actorId,
            },
          ],
          { session },
        );

        const poItem = po.items.find(
          (i) =>
            String(i.productId) === item.productId &&
            String(i.variantId ?? '') === String(item.variantId ?? ''),
        );
        if (poItem) poItem.quantityReceived += item.quantityReceived;
      }

      const fullyReceived = po.items.every((i) => i.quantityReceived >= i.quantityOrdered);
      po.status = fullyReceived
        ? PURCHASE_ORDER_STATUS.RECEIVED
        : PURCHASE_ORDER_STATUS.PARTIALLY_RECEIVED;
      await po.save({ session });

      return grn;
    });
  } finally {
    await session.endSession();
  }

  const finalPoDoc = await PurchaseOrderModel.findById(input.purchaseOrderId).lean();
  const grnResultDoc = await GrnModel.findOne({ purchaseOrderId: input.purchaseOrderId })
    .sort({ createdAt: -1 })
    .lean();

  const poSummary = finalPoDoc
    ? {
        status: finalPoDoc.status as string,
        supplierId: String(finalPoDoc.supplierId),
        poNumber: finalPoDoc.poNumber as string,
      }
    : null;

  if (grnResultDoc) {
    await recordAudit({
      actorId,
      action: 'create',
      resource: 'grn',
      resourceId: String(grnResultDoc._id),
      after: { grnNumber: grnResultDoc.grnNumber, purchaseOrderStatus: poSummary?.status },
    });
  }

  for (const created of newlyCreatedBatches) {
    await recordAudit({
      actorId,
      action: CATALOG_AUDIT_ACTIONS.ADMIN_CREATED_BATCH,
      resource: 'batch',
      resourceId: created.batchId,
      after: {
        productId: created.productId,
        warehouseId: created.warehouseId,
        batchNumber: created.batchNumber,
        expiryDate: created.expiryDate,
        mrp: created.mrp,
      },
    });
  }

  if (poSummary !== null) {
    try {
      const supplier = await SupplierModel.findById(poSummary.supplierId)
        .select('email name')
        .lean();
      if (supplier?.email) {
        await enqueueNotification({
          channel: 'email',
          templateKey: 'goods_received',
          recipient: supplier.email,
          data: { poNumber: poSummary.poNumber, status: poSummary.status, supplierName: supplier.name },
        });
      }
    } catch {
      // A notification hiccup must never fail a goods receipt that already committed.
    }
  }

  return grnResultDoc;
}

export async function getGrnById(id: string) {
  const grn = await GrnModel.findById(id).lean();
  if (!grn) throw new NotFoundError('GRN');
  return grn;
}
