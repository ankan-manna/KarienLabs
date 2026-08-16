import { PURCHASE_ORDER_STATUS } from '@medcommerce/shared';

import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { generateSequenceNumber } from '../../utils/sequence.util';
import { recordAudit } from '../audit/audit.service';
import { enqueueNotification } from '../notifications/notification.service';

import { SupplierModel } from './models/supplier.model';
import { purchaseOrderRepository } from './purchase-order.repository';

/** Fire-and-forget — a notification/audit hiccup must never fail a PO state transition that already succeeded. */
async function notifyPurchaseOrderEvent(
  po: { _id: unknown; poNumber: string; supplierId: unknown },
  status: string,
  actorId: string,
) {
  try {
    const supplier = await SupplierModel.findById(po.supplierId).select('email name').lean();
    if (supplier?.email) {
      await enqueueNotification({
        channel: 'email',
        templateKey: 'purchase_order_status_changed',
        recipient: supplier.email,
        data: { poNumber: po.poNumber, status, supplierName: supplier.name },
      });
    }
  } catch {
    // Ignored — see comment above.
  }

  await recordAudit({
    actorId,
    action: 'update',
    resource: 'purchase_order',
    resourceId: String(po._id),
    after: { status },
  });
}

interface PurchaseOrderItemInput {
  productId: string;
  variantId?: string | null;
  quantityOrdered: number;
  unitCost: number;
}

interface CreatePurchaseOrderInput {
  supplierId: string;
  warehouseId: string;
  items: PurchaseOrderItemInput[];
  expectedDeliveryDate?: Date;
  notes?: string;
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput, actorId: string) {
  const poNumber = await generateSequenceNumber('purchase_order', 'PO');
  const po = await purchaseOrderRepository.create({
    ...input,
    poNumber,
    status: PURCHASE_ORDER_STATUS.DRAFT,
    createdBy: actorId,
  });
  await recordAudit({
    actorId,
    action: 'create',
    resource: 'purchase_order',
    resourceId: String(po._id),
    after: { poNumber, status: PURCHASE_ORDER_STATUS.DRAFT },
  });
  return po;
}

export async function getPurchaseOrderById(id: string) {
  const po = await purchaseOrderRepository.findById(id);
  if (!po) throw new NotFoundError('Purchase order');
  return po;
}

export function listPurchaseOrders(query: ListQuery) {
  return purchaseOrderRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}

export async function sendPurchaseOrder(id: string, actorId: string) {
  const po = await getPurchaseOrderById(id);
  if (po.status !== PURCHASE_ORDER_STATUS.DRAFT) {
    throw new UnprocessableEntityError(`Cannot send a purchase order in "${po.status}" status`);
  }
  const updated = await purchaseOrderRepository.updateById(id, {
    status: PURCHASE_ORDER_STATUS.SENT,
    updatedBy: actorId,
  });
  await notifyPurchaseOrderEvent(po, PURCHASE_ORDER_STATUS.SENT, actorId);
  return updated;
}

export async function cancelPurchaseOrder(id: string, actorId: string) {
  const po = await getPurchaseOrderById(id);
  if (![PURCHASE_ORDER_STATUS.DRAFT, PURCHASE_ORDER_STATUS.SENT].includes(po.status as never)) {
    throw new UnprocessableEntityError(`Cannot cancel a purchase order in "${po.status}" status`);
  }
  const updated = await purchaseOrderRepository.updateById(id, {
    status: PURCHASE_ORDER_STATUS.CANCELLED,
    updatedBy: actorId,
  });
  await notifyPurchaseOrderEvent(po, PURCHASE_ORDER_STATUS.CANCELLED, actorId);
  return updated;
}
