import { PURCHASE_REQUEST_STATUS } from '@medcommerce/shared';

import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { generateSequenceNumber } from '../../utils/sequence.util';
import { recordAudit } from '../audit/audit.service';
import { UserModel } from '../auth/models/user.model';
import { enqueueNotification } from '../notifications/notification.service';

import * as purchaseOrderService from './purchase-order.service';
import { purchaseRequestRepository } from './purchase-request.repository';

interface PurchaseRequestItemInput {
  productId: string;
  quantity: number;
  estimatedUnitCost?: number;
  notes?: string;
}

interface CreatePurchaseRequestInput {
  warehouseId: string;
  items: PurchaseRequestItemInput[];
  notes?: string;
}

interface ConvertPurchaseRequestItemInput {
  productId: string;
  variantId?: string | null;
  quantityOrdered: number;
  unitCost: number;
}

interface ConvertPurchaseRequestInput {
  supplierId: string;
  items: ConvertPurchaseRequestItemInput[];
  expectedDeliveryDate?: Date;
  notes?: string;
}

async function notifyRequester(
  requestedBy: string,
  templateKey: string,
  data: Record<string, unknown>,
) {
  try {
    const requester = await UserModel.findById(requestedBy).select('email name').lean();
    if (requester?.email) {
      await enqueueNotification({
        channel: 'email',
        templateKey,
        recipient: requester.email,
        userId: String(requestedBy),
        data: { ...data, name: requester.name },
      });
    }
  } catch {
    // Notification failures must never block the workflow transition.
  }
}

export async function createPurchaseRequest(input: CreatePurchaseRequestInput, actorId: string) {
  const requestNumber = await generateSequenceNumber('purchase_request', 'PR');
  const created = await purchaseRequestRepository.create({
    ...input,
    requestNumber,
    status: PURCHASE_REQUEST_STATUS.PENDING,
    requestedBy: actorId,
    createdBy: actorId,
  });

  await recordAudit({
    actorId,
    action: 'create',
    resource: 'purchase_request',
    resourceId: String(created._id),
    after: created,
  });

  await notifyRequester(actorId, 'purchase_request_submitted', {
    requestNumber: created.requestNumber,
  });

  return created;
}

export async function getPurchaseRequestById(id: string) {
  const pr = await purchaseRequestRepository.findById(id);
  if (!pr) throw new NotFoundError('Purchase request');
  return pr;
}

export function listPurchaseRequests(query: ListQuery) {
  return purchaseRequestRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}

export async function approvePurchaseRequest(id: string, actorId: string) {
  const pr = await getPurchaseRequestById(id);
  if (pr.status !== PURCHASE_REQUEST_STATUS.PENDING) {
    throw new UnprocessableEntityError(`Cannot approve a purchase request in "${pr.status}" status`);
  }

  const updated = await purchaseRequestRepository.updateById(id, {
    status: PURCHASE_REQUEST_STATUS.APPROVED,
    approvedBy: actorId,
    updatedBy: actorId,
  });

  await recordAudit({
    actorId,
    action: 'update',
    resource: 'purchase_request',
    resourceId: id,
    before: { status: pr.status },
    after: { status: PURCHASE_REQUEST_STATUS.APPROVED },
  });

  await notifyRequester(String(pr.requestedBy), 'purchase_request_approved', {
    requestNumber: pr.requestNumber,
  });

  return updated;
}

export async function rejectPurchaseRequest(id: string, actorId: string, reason: string) {
  const pr = await getPurchaseRequestById(id);
  if (pr.status !== PURCHASE_REQUEST_STATUS.PENDING) {
    throw new UnprocessableEntityError(`Cannot reject a purchase request in "${pr.status}" status`);
  }

  const updated = await purchaseRequestRepository.updateById(id, {
    status: PURCHASE_REQUEST_STATUS.REJECTED,
    rejectionReason: reason,
    updatedBy: actorId,
  });

  await recordAudit({
    actorId,
    action: 'update',
    resource: 'purchase_request',
    resourceId: id,
    before: { status: pr.status },
    after: { status: PURCHASE_REQUEST_STATUS.REJECTED, rejectionReason: reason },
  });

  await notifyRequester(String(pr.requestedBy), 'purchase_request_rejected', {
    requestNumber: pr.requestNumber,
    reason,
  });

  return updated;
}

/**
 * Only an approved request can graduate into a real PurchaseOrder. Reuses
 * purchase-order.service.ts#createPurchaseOrder rather than duplicating
 * PO-creation logic, then marks this request "converted" and links the new PO.
 */
export async function convertToPurchaseOrder(
  id: string,
  actorId: string,
  input: ConvertPurchaseRequestInput,
) {
  const pr = await getPurchaseRequestById(id);
  if (pr.status !== PURCHASE_REQUEST_STATUS.APPROVED) {
    throw new UnprocessableEntityError(
      `Cannot convert a purchase request in "${pr.status}" status — it must be approved first`,
    );
  }

  const purchaseOrder = await purchaseOrderService.createPurchaseOrder(
    {
      supplierId: input.supplierId,
      warehouseId: String(pr.warehouseId),
      items: input.items,
      expectedDeliveryDate: input.expectedDeliveryDate,
      notes: input.notes,
    },
    actorId,
  );

  const updated = await purchaseRequestRepository.updateById(id, {
    status: PURCHASE_REQUEST_STATUS.CONVERTED,
    purchaseOrderId: purchaseOrder._id,
    updatedBy: actorId,
  });

  await recordAudit({
    actorId,
    action: 'update',
    resource: 'purchase_request',
    resourceId: id,
    before: { status: pr.status },
    after: { status: PURCHASE_REQUEST_STATUS.CONVERTED, purchaseOrderId: purchaseOrder._id },
  });

  return updated;
}
