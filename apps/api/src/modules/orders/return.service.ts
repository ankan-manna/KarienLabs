import {
  DEFAULT_RETURN_WINDOW_DAYS,
  DEFAULT_RETURN_WINDOW_DAYS_BY_REASON,
  NOTIFICATION_CATEGORIES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  QC_RESULT,
  RETURN_AUDIT_ACTIONS,
  RETURN_RESOLUTION_TYPE,
  RETURN_STATUS,
  RETURN_STATUS_TRANSITIONS,
  STOCK_MOVEMENT_TYPES,
  type QcResult,
  type ReturnStatus,
  type Role,
} from '@medcommerce/shared';
import mongoose from 'mongoose';

import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { generateSequenceNumber } from '../../utils/sequence.util';
import { issueRefund } from '../admin/payments.service';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { UserModel } from '../auth/models/user.model';
import { ProductModel } from '../catalog/models/product.model';
import { BatchModel } from '../inventory/models/batch.model';
import { StockMovementModel } from '../inventory/models/stock-movement.model';
import { enqueueNotification, notifyAdmins } from '../notifications/notification.service';
import { PaymentModel } from '../payments/models/payment.model';
import { RefundModel } from '../payments/models/refund.model';
import { getConfiguration } from '../platform/configuration.service';

import { OrderModel, type OrderDocument } from './models/order.model';
import { ReturnModel } from './models/return.model';
import { resolveFulfillingWarehouse } from './order-fulfillment.util';
import { decrementStockFifo } from './order.service';
import { calculateReturnRefundAmount } from './return-refund-calculation.util';
import { createReverseShipmentForReturn } from './return-shiprocket.service';
import { returnRepository } from './return.repository';

interface RequestReturnItemInput {
  orderItemId: string;
  quantity: number;
  reason: string;
  description?: string;
  evidenceUrls?: string[];
  requestedResolution?: 'refund' | 'replacement';
}

interface RequestReturnInput {
  orderId: string;
  items: RequestReturnItemInput[];
}

function resolveActorType(actorRole?: Role) {
  return actorRole ? actorTypeForRole(actorRole) : undefined;
}

async function notifyReturnEvent(
  ret: { customerId: mongoose.Types.ObjectId | string; _id: mongoose.Types.ObjectId | string },
  templateKey: string,
  data: Record<string, unknown> = {},
) {
  try {
    const customer = await UserModel.findById(ret.customerId).select('email name').lean();
    if (customer?.email) {
      await enqueueNotification({
        channel: 'email',
        templateKey,
        recipient: customer.email,
        userId: String(ret.customerId),
        category: NOTIFICATION_CATEGORIES.RETURN,
        data: { name: customer.name, ...data },
      });
    }
  } catch {
    // Never let a notification failure block the return workflow.
  }
}

/** Part 2/4 — reads the admin-configurable reason->window-days map from the `returns` Configuration namespace, falling back to RET-01's published default when unset (never a hardcoded ceiling the config can't override). */
async function resolveReturnWindowDays(reason: string): Promise<number> {
  const config = (await getConfiguration('returns')) as {
    returnWindowDaysByReason?: Record<string, number>;
    defaultReturnWindowDays?: number;
  };
  const byReason: Record<string, number> =
    config.returnWindowDaysByReason ?? DEFAULT_RETURN_WINDOW_DAYS_BY_REASON;
  const fallback = config.defaultReturnWindowDays ?? DEFAULT_RETURN_WINDOW_DAYS;
  return byReason[reason] ?? fallback;
}

/** Part 6 — sums the quantity already requested (in any non-REJECTED return) for a given order item, so a second/duplicate request can never exceed what's actually left to return. */
async function getAlreadyRequestedQuantity(orderId: string, orderItemId: string, excludeReturnId?: string): Promise<number> {
  const filter: Record<string, unknown> = {
    orderId,
    status: { $ne: RETURN_STATUS.REJECTED },
    'items.orderItemId': orderItemId,
  };
  if (excludeReturnId) filter._id = { $ne: excludeReturnId };
  const returns = await ReturnModel.find(filter).select('items').lean();
  let total = 0;
  for (const ret of returns) {
    for (const item of ret.items) {
      if (String(item.orderItemId) === orderItemId) total += item.quantity;
    }
  }
  return total;
}

export async function requestReturn(input: RequestReturnInput, userId: string) {
  const order = await OrderModel.findOne({ _id: input.orderId, customerId: userId });
  if (!order) throw new NotFoundError('Order');
  if (order.status !== ORDER_STATUS.DELIVERED) {
    throw new UnprocessableEntityError('Only a delivered order can be returned');
  }

  const deliveredEvent = [...order.statusHistory]
    .reverse()
    .find((event) => event.status === ORDER_STATUS.DELIVERED);

  const orderItemMap = new Map(order.items.map((item) => [String(item._id), item]));
  const productIds = input.items
    .map((i) => orderItemMap.get(i.orderItemId)?.productId)
    .filter((id): id is NonNullable<typeof id> => !!id);
  const products = await ProductModel.find({ _id: { $in: productIds } })
    .select('name isReturnable nonReturnableReason')
    .lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const preparedItems: Record<string, unknown>[] = [];

  for (const requested of input.items) {
    const orderItem = orderItemMap.get(requested.orderItemId);
    if (!orderItem) {
      throw new UnprocessableEntityError(`Item ${requested.orderItemId} is not part of this order`);
    }

    // Part 5 — per-product returnability, a configurable extension point
    // (defaults returnable=true) rather than an invented universal rule.
    const product = productMap.get(String(orderItem.productId));
    if (product && product.isReturnable === false) {
      throw new UnprocessableEntityError(
        `"${orderItem.name}" is not eligible for return${product.nonReturnableReason ? `: ${product.nonReturnableReason}` : ''}`,
      );
    }

    // Part 2/6 — reason-keyed return window (RET-01), measured from the
    // order's actual DELIVERED event, and remaining-quantity enforcement so
    // a second request can never push the total past what was delivered.
    if (deliveredEvent) {
      const windowDays = await resolveReturnWindowDays(requested.reason);
      const daysSinceDelivery = (Date.now() - new Date(deliveredEvent.changedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceDelivery > windowDays) {
        throw new UnprocessableEntityError(
          `Return window has closed for "${requested.reason}" (${windowDays} days from delivery)`,
        );
      }
    }

    const alreadyRequested = await getAlreadyRequestedQuantity(String(order._id), requested.orderItemId);
    const remaining = orderItem.quantity - alreadyRequested;
    if (requested.quantity > remaining) {
      throw new UnprocessableEntityError(
        `Only ${Math.max(0, remaining)} unit(s) of "${orderItem.name}" remain eligible for return`,
      );
    }

    preparedItems.push({
      orderItemId: requested.orderItemId,
      quantity: requested.quantity,
      reason: requested.reason,
      description: requested.description ?? '',
      evidenceUrls: requested.evidenceUrls ?? [],
      requestedResolution: requested.requestedResolution ?? RETURN_RESOLUTION_TYPE.REFUND,
      // Immutable snapshot (Part 3) — never re-read from the live order after this.
      productId: orderItem.productId,
      name: orderItem.name,
      sku: orderItem.sku,
      unitPrice: orderItem.unitPrice,
      gstRate: orderItem.gstRate,
      batchId: orderItem.batchId ?? null,
    });
  }

  const returnNumber = await generateSequenceNumber('return', 'RET');

  const ret = await returnRepository.create({
    returnNumber,
    orderId: order._id,
    customerId: userId,
    sellerId: order.sellerId ?? null,
    items: preparedItems,
    status: RETURN_STATUS.REQUESTED,
    createdBy: userId,
  });

  await recordAudit({
    actorId: userId,
    action: RETURN_AUDIT_ACTIONS.RETURN_REQUESTED,
    resource: 'return',
    resourceId: String(ret._id),
    after: { returnNumber, orderId: String(order._id) },
  });
  await notifyReturnEvent(ret, 'return_requested', { returnNumber });

  // Part 12 — the previously-missing "return request submitted" admin alert.
  const requestingCustomer = await UserModel.findById(userId).select('name').lean();
  await notifyAdmins({
    templateKey: 'return_requested_admin',
    orderId: String(order._id),
    data: { returnNumber, orderNumber: order.orderNumber, customerName: requestingCustomer?.name ?? 'A customer' },
  });

  return ret;
}

export function listMyReturns(userId: string, query: ListQuery) {
  return returnRepository.paginate(
    { ...query.filter, customerId: userId },
    { page: query.page, limit: query.limit, sort: query.sort ?? '-createdAt' },
  );
}

/**
 * Part 8 — Admin filtering. `status`/`sellerId`/`warehouseId`/`orderId`/
 * `customerId` are all real top-level Return fields so they pass through to
 * Mongo as exact-match filters unchanged; `dateFrom`/`dateTo` (createdAt
 * range) and `reason` (matched against any item's reason) are translated
 * here, same pattern as admin/invoices.service.ts's listInvoicesAdmin.
 */
export function listReturns(query: ListQuery) {
  const { dateFrom, dateTo, reason, ...rest } = query.filter ?? {};
  const filter: Record<string, unknown> = { ...rest };

  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = new Date(dateFrom);
    if (dateTo) createdAt.$lte = new Date(dateTo);
    filter.createdAt = createdAt;
  }
  if (reason) filter['items.reason'] = reason;

  return returnRepository.paginate(filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort ?? '-createdAt',
  });
}

export async function getReturnById(id: string, requester: { id: string; role: string }) {
  const isStaff = requester.role !== 'customer';
  const ret = await returnRepository.findById(id);
  if (!ret) throw new NotFoundError('Return request');
  if (!isStaff && String(ret.customerId) !== requester.id) {
    throw new ForbiddenError('You cannot view this return request');
  }
  return ret;
}

/** Part 31/41 — the ONE state-transition guard every return status change goes through; rejects anything RETURN_STATUS_TRANSITIONS doesn't allow, so two concurrent actions on the same return can't both "succeed" into an inconsistent state. */
async function transitionReturn(
  id: string,
  to: ReturnStatus,
  actorId: string,
  extra: Record<string, unknown> = {},
) {
  const ret = await ReturnModel.findOne({ _id: id, deletedAt: null });
  if (!ret) throw new NotFoundError('Return request');
  const allowed = RETURN_STATUS_TRANSITIONS[ret.status as ReturnStatus] ?? [];
  if (!allowed.includes(to)) {
    throw new UnprocessableEntityError(`Cannot move return from "${ret.status}" to "${to}"`);
  }
  ret.set('status', to);
  for (const [key, value] of Object.entries(extra)) ret.set(key, value);
  ret.set('updatedBy', actorId);
  await ret.save();
  return ret;
}

/**
 * Part 10 — approval re-validates eligibility server-side (never trusts that
 * "it was eligible when requested" still holds), resolves the receiving
 * seller/warehouse (Part 36/37), and kicks off the reverse-pickup shipment
 * (Part 11/13) — a failure there is logged on the return but does NOT block
 * approval itself; it's independently retryable (see the /reverse-shipment
 * retry endpoint), so a Shiprocket outage never leaves a return stuck.
 */
export async function approveReturn(id: string, actorId: string, actorRole?: Role) {
  const order = await (async () => {
    const ret = await ReturnModel.findById(id).select('orderId').lean();
    if (!ret) throw new NotFoundError('Return request');
    return OrderModel.findById(ret.orderId);
  })();
  if (!order) throw new NotFoundError('Order');

  const warehouse = await resolveFulfillingWarehouse(order);

  const ret = await transitionReturn(id, RETURN_STATUS.APPROVED, actorId, {
    approvedBy: actorId,
    sellerId: order.sellerId ?? null,
    warehouseId: warehouse?._id ?? null,
  });

  await recordAudit({
    actorId,
    actorType: resolveActorType(actorRole),
    action: RETURN_AUDIT_ACTIONS.RETURN_APPROVED,
    resource: 'return',
    resourceId: String(ret._id),
  });
  await notifyReturnEvent(ret, 'return_approved', { returnNumber: ret.returnNumber });

  try {
    await createReverseShipmentForReturn(String(ret._id), { id: actorId, role: actorRole });
  } catch {
    // Non-fatal — approval already succeeded; reverse-shipment creation is
    // independently retryable (Part 40) and its own failure is already
    // recorded on ret.reverseShipment.lastError + audited.
  }

  return returnRepository.findById(String(ret._id));
}

export async function rejectReturn(id: string, actorId: string, reason: string, actorRole?: Role) {
  const ret = await transitionReturn(id, RETURN_STATUS.REJECTED, actorId, {
    approvedBy: actorId,
    rejectionReason: reason,
  });
  await recordAudit({
    actorId,
    actorType: resolveActorType(actorRole),
    action: RETURN_AUDIT_ACTIONS.RETURN_REJECTED,
    resource: 'return',
    resourceId: String(ret._id),
    metadata: { reason },
  });
  await notifyReturnEvent(ret, 'return_rejected', { reason });
  return ret;
}

export async function markPickedUp(id: string, actorId: string, actorRole?: Role) {
  const ret = await transitionReturn(id, RETURN_STATUS.PICKED_UP, actorId);
  await recordAudit({
    actorId,
    actorType: resolveActorType(actorRole),
    action: RETURN_AUDIT_ACTIONS.RETURN_PICKED_UP,
    resource: 'return',
    resourceId: String(ret._id),
  });
  await notifyReturnEvent(ret, 'return_picked_up', {});
  return ret;
}

/**
 * Part 15 — records physical receipt only. Deliberately does NOT restock or
 * refund anything here ("do not automatically mark the product as sellable
 * merely because it was received") — that's inspectReturn's job.
 */
export async function receiveReturn(id: string, actorId: string, actorRole?: Role) {
  const ret = await transitionReturn(id, RETURN_STATUS.RECEIVED, actorId, {
    receivedAt: new Date(),
    receivedBy: actorId,
  });
  await recordAudit({
    actorId,
    actorType: resolveActorType(actorRole),
    action: RETURN_AUDIT_ACTIONS.RETURN_RECEIVED,
    resource: 'return',
    resourceId: String(ret._id),
  });
  await notifyReturnEvent(ret, 'return_received', {});
  return ret;
}

interface InspectItemInput {
  orderItemId: string;
  qcResult: QcResult;
  notes?: string;
}

/**
 * Part 16/17/18/19 — the QC gate. For each returned item, resolves the
 * ACTUAL batch(es) the sold quantity came from (never a different/current
 * batch) via the order's own SALE StockMovements, then either:
 *  - SELLABLE: restocks that exact batch (RETURN movement, +qty) — unless
 *    the batch has since been recalled, in which case it's treated as
 *    non-resellable regardless of the QC call (Part 17: "if the batch is
 *    recalled... it must not automatically become available inventory").
 *  - DAMAGED/EXPIRED/TAMPERED: no quantityAvailable change (the unit was
 *    never added back), but a zero-quantity DAMAGE/EXPIRY_WRITE_OFF
 *    StockMovement is still recorded for a complete audit trail (Part 19).
 * All of this goes through Batch/StockMovement directly — the same
 * primitives the existing Inventory domain uses everywhere else, not a
 * second inventory-mutation path (Part 18).
 */
export async function inspectReturn(
  id: string,
  items: InspectItemInput[],
  actorId: string,
  actorRole?: Role,
) {
  const ret = await ReturnModel.findOne({ _id: id, deletedAt: null });
  if (!ret) throw new NotFoundError('Return request');
  const allowed = RETURN_STATUS_TRANSITIONS[ret.status as ReturnStatus] ?? [];
  if (!allowed.includes(RETURN_STATUS.INSPECTED)) {
    throw new UnprocessableEntityError(`Cannot inspect a return in "${ret.status}" status`);
  }

  const order = await OrderModel.findById(ret.orderId);
  if (!order) throw new NotFoundError('Order');

  const qcByItemId = new Map(items.map((i) => [i.orderItemId, i]));

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const retItem of ret.items) {
        const qc = qcByItemId.get(String(retItem.orderItemId));
        if (!qc) continue; // items not submitted for inspection this round are left untouched.

        const orderItem = order.items.find((i) => String(i._id) === String(retItem.orderItemId));
        if (!orderItem) continue;

        let remaining = retItem.quantity;
        const saleMovements = await StockMovementModel.find({
          referenceType: 'order',
          referenceId: order._id,
          type: STOCK_MOVEMENT_TYPES.SALE,
        }).session(session);

        let primaryBatchId: mongoose.Types.ObjectId | null = null;

        for (const movement of saleMovements) {
          if (remaining <= 0) break;
          const batch = await BatchModel.findById(movement.batchId).session(session);
          if (!batch || String(batch.productId) !== String(orderItem.productId)) continue;

          const consumedQty = Math.abs(movement.quantity);
          const restoreQty = Math.min(consumedQty, remaining);
          if (!primaryBatchId) primaryBatchId = batch._id as mongoose.Types.ObjectId;

          // Part 17 — a recalled batch is never automatically restocked,
          // regardless of the QC call.
          const isSellable = qc.qcResult === QC_RESULT.SELLABLE && !batch.recallFlag;

          if (isSellable) {
            batch.quantityAvailable += restoreQty;
            await batch.save({ session });
          }

          await StockMovementModel.create(
            [
              {
                batchId: batch._id,
                warehouseId: batch.warehouseId,
                type: isSellable
                  ? STOCK_MOVEMENT_TYPES.RETURN
                  : qc.qcResult === QC_RESULT.EXPIRED
                    ? STOCK_MOVEMENT_TYPES.EXPIRY_WRITE_OFF
                    : STOCK_MOVEMENT_TYPES.DAMAGE,
                quantity: isSellable ? restoreQty : 0,
                balanceAfter: batch.quantityAvailable,
                referenceType: 'return',
                referenceId: ret._id,
                performedBy: actorId,
                notes: `QC: ${qc.qcResult}${qc.notes ? ` — ${qc.notes}` : ''}`,
              },
            ],
            { session },
          );
          remaining -= restoreQty;
        }

        retItem.set('qcResult', qc.qcResult);
        retItem.set('batchId', primaryBatchId);
        retItem.set('restocked', qc.qcResult === QC_RESULT.SELLABLE);
        retItem.set('inspectionNotes', qc.notes ?? '');
      }

      ret.set('status', RETURN_STATUS.INSPECTED);
      ret.set('inspectedAt', new Date());
      ret.set('inspectedBy', actorId);
      ret.set('updatedBy', actorId);
      await ret.save({ session });
    });
  } finally {
    await session.endSession();
  }

  const restockedCount = ret.items.filter((i) => i.restocked).length;
  const quarantinedCount = ret.items.filter((i) => i.qcResult && !i.restocked).length;

  await recordAudit({
    actorId,
    actorType: resolveActorType(actorRole),
    action: RETURN_AUDIT_ACTIONS.RETURN_INSPECTED,
    resource: 'return',
    resourceId: String(ret._id),
    metadata: { restockedCount, quarantinedCount },
  });
  if (restockedCount > 0) {
    await recordAudit({
      actorId,
      actorType: resolveActorType(actorRole),
      action: RETURN_AUDIT_ACTIONS.INVENTORY_RETURNED_TO_STOCK,
      resource: 'return',
      resourceId: String(ret._id),
      metadata: { restockedCount },
    });
  }
  if (quarantinedCount > 0) {
    await recordAudit({
      actorId,
      actorType: resolveActorType(actorRole),
      action: RETURN_AUDIT_ACTIONS.INVENTORY_QUARANTINED,
      resource: 'return',
      resourceId: String(ret._id),
      metadata: { quarantinedCount },
    });
  }

  return returnRepository.findById(String(ret._id));
}

/**
 * Part 20/21/22/24/25/40 — computes the refund strictly from the order's
 * frozen item/discount snapshot (never re-priced), caps it against what's
 * actually still refundable for the order, and is idempotent: a return
 * that already has a `refundId` returns the existing refund instead of
 * calling Razorpay a second time.
 */
export async function resolveReturnRefund(id: string, actorId: string, actorRole?: Role) {
  const ret = await ReturnModel.findOne({ _id: id, deletedAt: null });
  if (!ret) throw new NotFoundError('Return request');
  if (ret.refundId) return returnRepository.findById(String(ret._id)); // already resolved — idempotent no-op.

  const allowed = RETURN_STATUS_TRANSITIONS[ret.status as ReturnStatus] ?? [];
  if (!allowed.includes(RETURN_STATUS.REFUNDED)) {
    throw new UnprocessableEntityError(`Cannot refund a return in "${ret.status}" status`);
  }

  const order = await OrderModel.findById(ret.orderId);
  if (!order?.totals) throw new NotFoundError('Order');
  const payment = order.paymentId ? await PaymentModel.findById(order.paymentId) : null;
  if (!payment?.razorpayPaymentId) {
    throw new UnprocessableEntityError('Order has no captured payment to refund against');
  }

  const alreadyRefunded = await RefundModel.aggregate([
    { $match: { orderId: order._id, status: { $ne: 'failed' } } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  const calculation = calculateReturnRefundAmount({
    orderItems: order.items.map((i) => ({
      orderItemId: String(i._id),
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      gstRate: i.gstRate,
      amount: i.amount,
      couponDiscountAmount: i.couponDiscountAmount,
    })),
    orderDiscount: order.totals.discount ?? 0,
    returnItems: ret.items.map((i) => ({ orderItemId: String(i.orderItemId), quantity: i.quantity })),
    paidAmount: order.totals.grandTotal,
    alreadyRefundedAmount: alreadyRefunded[0]?.total ?? 0,
  });

  if (calculation.refundableAmount <= 0) {
    throw new UnprocessableEntityError('Nothing remains refundable for this return');
  }

  await recordAudit({
    actorId,
    actorType: resolveActorType(actorRole),
    action: RETURN_AUDIT_ACTIONS.REFUND_REQUESTED,
    resource: 'return',
    resourceId: String(ret._id),
    metadata: { refundableAmount: calculation.refundableAmount },
  });

  ret.set('status', RETURN_STATUS.REFUNDED);
  ret.set('resolutionType', RETURN_RESOLUTION_TYPE.REFUND);
  ret.set('updatedBy', actorId);
  await ret.save();

  try {
    await issueRefund(
      String(payment._id),
      {
        amountInPaise: Math.round(calculation.refundableAmount * 100),
        reason: 'Return resolved as refund',
        returnId: String(ret._id),
      },
      actorId,
    );
    await recordAudit({
      actorId,
      actorType: resolveActorType(actorRole),
      action: RETURN_AUDIT_ACTIONS.REFUND_SUCCESS,
      resource: 'return',
      resourceId: String(ret._id),
      metadata: { amount: calculation.refundableAmount },
    });
    await notifyReturnEvent(ret, 'refund_success', { amount: calculation.refundableAmount });
  } catch (err) {
    // Refund initiation failed at Razorpay — roll the RETURN status back so
    // it isn't stuck claiming REFUNDED with no actual refund (issueRefund
    // itself never created a Refund row if the Razorpay call failed).
    ret.set('status', RETURN_STATUS.INSPECTED);
    ret.set('resolutionType', null);
    await ret.save();
    await recordAudit({
      actorId,
      actorType: resolveActorType(actorRole),
      action: RETURN_AUDIT_ACTIONS.REFUND_FAILED,
      resource: 'return',
      resourceId: String(ret._id),
      result: 'failure',
      failureReason: err instanceof Error ? err.message : 'Unknown error',
    });
    await notifyReturnEvent(ret, 'refund_failed', {});

    // Part 12 — the previously-missing "refund failure" admin alert. A
    // failed Razorpay refund needs operational attention (manual retry/
    // investigation), not just a customer-facing "something went wrong."
    await notifyAdmins({
      templateKey: 'refund_failed_admin',
      orderId: ret.orderId ? String(ret.orderId) : undefined,
      data: {
        returnNumber: ret.returnNumber,
        reason: err instanceof Error ? err.message : 'Unknown error',
      },
    });

    throw err;
  }

  return returnRepository.findById(String(ret._id));
}

/**
 * Part 26/27/28/29/30 — replacement is a SEPARATE, fully traceable Order
 * (originalOrderId/returnId/isReplacementOrder), never a mutation of the
 * original order's items. Stock is reserved via the EXISTING FEFO/recall-
 * safe decrementStockFifo (Part 27) before the order is created; if stock
 * isn't available the caller should fall back to resolveReturnRefund
 * instead (Part 18's "refund remains the fallback"). No new payment is
 * created (Part 30) — the replacement order is stamped paymentStatus
 * CAPTURED/paymentId null, reusing the ALREADY-paid original order's money.
 */
export async function resolveReturnReplacement(id: string, actorId: string, actorRole?: Role) {
  const ret = await ReturnModel.findOne({ _id: id, deletedAt: null });
  if (!ret) throw new NotFoundError('Return request');
  if (ret.replacementOrderId) return returnRepository.findById(String(ret._id)); // idempotent no-op.

  const allowed = RETURN_STATUS_TRANSITIONS[ret.status as ReturnStatus] ?? [];
  if (!allowed.includes(RETURN_STATUS.REPLACED)) {
    throw new UnprocessableEntityError(`Cannot replace a return in "${ret.status}" status`);
  }

  const originalOrder = await OrderModel.findById(ret.orderId);
  if (!originalOrder) throw new NotFoundError('Order');

  // Eligibility for replacement is "has this item completed QC" — NOT "was
  // the returned unit itself sellable." A damaged/expired/tampered return is
  // exactly the case a customer wants a replacement for; qcResult only
  // governs whether the RETURNED unit gets restocked (inspectReturn), not
  // whether a NEW unit can be sent out (that's the stock-availability check
  // decrementStockFifo performs below, against fresh inventory).
  const inspectedItems = ret.items.filter((i) => i.qcResult);
  if (inspectedItems.length === 0) {
    throw new UnprocessableEntityError('No inspected items available to replace');
  }

  const session = await mongoose.startSession();
  let replacementOrder: (OrderDocument & { _id: mongoose.Types.ObjectId }) | null = null;

  try {
    replacementOrder = await session.withTransaction(async () => {
      const orderItemMap = new Map(originalOrder.items.map((i) => [String(i._id), i]));
      const items = inspectedItems.map((retItem) => {
        const orderItem = orderItemMap.get(String(retItem.orderItemId));
        if (!orderItem) throw new UnprocessableEntityError('Original order item no longer exists');
        return {
          productId: orderItem.productId,
          variantId: orderItem.variantId ?? null,
          name: orderItem.name,
          sku: orderItem.sku,
          quantity: retItem.quantity,
          unitPrice: orderItem.unitPrice,
          gstRate: orderItem.gstRate,
          amount: Math.round(orderItem.unitPrice * retItem.quantity * (1 + orderItem.gstRate / 100) * 100) / 100,
        };
      });

      const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
      const gst = items.reduce((s, i) => s + i.unitPrice * i.quantity * (i.gstRate / 100), 0);
      const grandTotal = Math.round((subtotal + gst) * 100) / 100;

      const orderNumber = await generateSequenceNumber('order', 'REP');
      const [created] = await OrderModel.create(
        [
          {
            orderNumber,
            customerId: originalOrder.customerId,
            sellerId: originalOrder.sellerId ?? null,
            items,
            shippingAddress: originalOrder.shippingAddress,
            status: ORDER_STATUS.PLACED,
            // No new charge is collected (Part 30) — the customer already
            // paid for this on the original order; CAPTURED here is the
            // truthful signal for downstream consumers (e.g. Shiprocket's
            // payment_method mapping) that no COD collection is needed.
            paymentStatus: PAYMENT_STATUS.CAPTURED,
            totals: { subtotal, gst, shipping: 0, discount: 0, grandTotal },
            originalOrderId: originalOrder._id,
            returnId: ret._id,
            isReplacementOrder: true,
            createdBy: actorId,
          },
        ],
        { session },
      );

      // Reuses the EXACT same FEFO/recall-safe stock picker checkout() uses
      // (Part 27) — throws (rolling back the whole transaction) if there's
      // genuinely no sellable stock, which is exactly "replacement stock
      // unavailable -> caller falls back to refund" (Part 18/26).
      for (const item of items) {
        await decrementStockFifo(
          String(item.productId),
          item.variantId ? String(item.variantId) : null,
          item.quantity,
          created._id as mongoose.Types.ObjectId,
          actorId,
          session,
          originalOrder.sellerId ? null : null, // replacement stays within the same seller-agnostic pool the original checkout used; a stricter warehouse scope isn't available post-hoc without re-deriving it, and over-restricting here would wrongly fail an otherwise-valid replacement.
        );
      }

      return created as OrderDocument & { _id: mongoose.Types.ObjectId };
    });
  } finally {
    await session.endSession();
  }

  if (!replacementOrder) throw new UnprocessableEntityError('Failed to create replacement order');

  ret.set('status', RETURN_STATUS.REPLACED);
  ret.set('resolutionType', RETURN_RESOLUTION_TYPE.REPLACEMENT);
  ret.set('replacementOrderId', replacementOrder._id);
  ret.set('updatedBy', actorId);
  await ret.save();

  await recordAudit({
    actorId,
    actorType: resolveActorType(actorRole),
    action: RETURN_AUDIT_ACTIONS.REPLACEMENT_CREATED,
    resource: 'return',
    resourceId: String(ret._id),
    after: { replacementOrderId: String(replacementOrder._id), orderNumber: replacementOrder.orderNumber },
  });
  await notifyReturnEvent(ret, 'replacement_approved', { orderNumber: replacementOrder.orderNumber });

  // Fast-tracks the replacement straight to PACKED (payment/picking already
  // implicit — the goods are simply being re-sent) so it flows through the
  // EXISTING invoice-generation + Shiprocket-shipment automation (Prompt
  // 13/14) exactly like any other order reaching that status, with zero
  // duplicated fulfillment logic (Part 29).
  const { updateOrderStatus } = await import('./order.service');
  try {
    await updateOrderStatus(String(replacementOrder._id), ORDER_STATUS.CONFIRMED, null);
    await updateOrderStatus(String(replacementOrder._id), ORDER_STATUS.PACKED, null);
  } catch {
    // Non-fatal — the replacement order exists and is reserved; an admin can
    // advance its status manually from the Orders page if the automatic
    // fast-track hits an unexpected transition guard.
  }

  return returnRepository.findById(String(ret._id));
}
