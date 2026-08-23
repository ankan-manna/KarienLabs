import { PAYMENT_STATUS, REFUND_STATUS, RETURN_STATUS } from '@medcommerce/shared';

import { refundPayment } from '../../integrations/razorpay/razorpay.service';
import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { recordAudit } from '../audit/audit.service';
import { UserModel } from '../auth/models/user.model';
import { enqueueNotification } from '../notifications/notification.service';
import { OrderModel } from '../orders/models/order.model';
import { returnRepository } from '../orders/return.repository';
import { PaymentModel } from '../payments/models/payment.model';
import { RefundModel } from '../payments/models/refund.model';

export function listPayments(query: ListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = { ...query.filter };

  return Promise.all([
    PaymentModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PaymentModel.countDocuments(filter),
  ]).then(([items, total]) => ({
    items,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  }));
}

export async function getPaymentById(id: string) {
  const payment = await PaymentModel.findById(id).lean();
  if (!payment) throw new NotFoundError('Payment');
  const order = await OrderModel.findById(payment.orderId).lean();
  return { payment, order };
}

export function listFailedPayments(query: ListQuery) {
  return listPayments({ ...query, filter: { ...query.filter, status: PAYMENT_STATUS.FAILED } });
}

interface RefundInput {
  amountInPaise?: number;
  reason?: string;
  returnId?: string;
}

/**
 * Admin-initiated (or return-triggered, see orders/return.service.ts) refund —
 * calls Razorpay, marks Payment/Order as refunded, and persists a Refund record
 * (previously this only mutated Payment/Order with no standalone Refund history).
 * Full refund when `amountInPaise` is omitted.
 *
 * Part 20/40 — idempotent when scoped to a `returnId`: a retried
 * call for a return that already has a non-FAILED Refund record returns
 * that existing record instead of calling Razorpay (and therefore Refund.create)
 * a second time. Not scoped this way for plain admin-initiated refunds
 * (no returnId), which intentionally support issuing multiple partial
 * refunds against the same payment over time.
 */
export async function issueRefund(paymentId: string, input: RefundInput, actorId: string) {
  if (input.returnId) {
    const existing = await RefundModel.findOne({
      returnId: input.returnId,
      status: { $ne: REFUND_STATUS.FAILED },
    });
    if (existing) return PaymentModel.findById(paymentId);
  }

  const payment = await PaymentModel.findById(paymentId);
  if (!payment) throw new NotFoundError('Payment');
  if (payment.status !== PAYMENT_STATUS.CAPTURED) {
    throw new UnprocessableEntityError(`Only a captured payment can be refunded (current: "${payment.status}")`);
  }
  if (!payment.razorpayPaymentId) {
    throw new UnprocessableEntityError('Payment has no captured Razorpay payment id');
  }

  const razorpayRefund = await refundPayment(payment.razorpayPaymentId, input.amountInPaise);

  payment.status = PAYMENT_STATUS.REFUNDED;
  payment.failureReason = input.reason ? `Refunded: ${input.reason}` : payment.failureReason;
  payment.set('updatedBy', actorId);
  await payment.save();

  await OrderModel.updateOne({ _id: payment.orderId }, { paymentStatus: PAYMENT_STATUS.REFUNDED });

  const refund = await RefundModel.create({
    orderId: payment.orderId,
    paymentId: payment._id,
    returnId: input.returnId ?? null,
    razorpayRefundId: (razorpayRefund as { id?: string } | undefined)?.id ?? null,
    amount: (input.amountInPaise ?? payment.amount) / 100,
    reason: input.reason ?? '',
    status: REFUND_STATUS.PROCESSED,
    initiatedBy: actorId,
  });

  if (input.returnId) {
    await returnRepository.updateById(input.returnId, {
      refundId: refund._id,
      status: RETURN_STATUS.REFUNDED,
    });
  }

  await recordAudit({
    actorId,
    action: 'update',
    resource: 'refund',
    resourceId: String(refund._id),
    after: { amount: refund.amount, orderId: String(payment.orderId) },
  });

  try {
    const order = await OrderModel.findById(payment.orderId).select('customerId orderNumber').lean();
    const customer = order ? await UserModel.findById(order.customerId).select('email name').lean() : null;
    if (customer?.email && order) {
      await enqueueNotification({
        channel: 'email',
        templateKey: 'refund_processed',
        recipient: customer.email,
        userId: String(order.customerId),
        data: { orderNumber: order.orderNumber, amount: refund.amount, name: customer.name },
      });
    }
  } catch {
    // Notification failure must never fail a refund that already succeeded.
  }

  return payment;
}
