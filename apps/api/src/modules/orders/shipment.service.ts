import {
  ACTOR_TYPES,
  ORDER_STATUS,
  SHIPMENT_STATUS,
  type OrderStatus,
  type ShipmentStatus,
} from '@medcommerce/shared';
import mongoose from 'mongoose';

import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { recordAudit } from '../audit/audit.service';
import { UserModel } from '../auth/models/user.model';
import { enqueueNotification } from '../notifications/notification.service';

import { OrderModel } from './models/order.model';
import { ShipmentModel, type ShipmentDocument } from './models/shipment.model';
import { updateOrderStatus } from './order.service';
import { shipmentRepository } from './shipment.repository';

/** Order statuses a shipment can legitimately be created against — before CONFIRMED there's nothing to pack/ship yet, and terminal/exception statuses can never receive a new shipment. */
const SHIPPABLE_ORDER_STATUSES: OrderStatus[] = [
  ORDER_STATUS.CONFIRMED,
  ORDER_STATUS.PACKED,
  ORDER_STATUS.READY_FOR_DISPATCH,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED,
];

/** Shipment status -> equivalent Order status, for the subset of shipment states that have a direct order-facing equivalent. FAILED/RTO are operational-only and have no mapping. */
const SHIPMENT_TO_ORDER_STATUS: Partial<Record<ShipmentStatus, OrderStatus>> = {
  [SHIPMENT_STATUS.READY_FOR_DISPATCH]: ORDER_STATUS.READY_FOR_DISPATCH,
  [SHIPMENT_STATUS.PICKED_UP]: ORDER_STATUS.SHIPPED,
  [SHIPMENT_STATUS.IN_TRANSIT]: ORDER_STATUS.SHIPPED,
  [SHIPMENT_STATUS.OUT_FOR_DELIVERY]: ORDER_STATUS.OUT_FOR_DELIVERY,
  [SHIPMENT_STATUS.DELIVERED]: ORDER_STATUS.DELIVERED,
};

interface CreateShipmentInput {
  orderId: string;
  deliveryPartnerId?: string;
  trackingNumber?: string;
  itemIds?: string[];
  estimatedDeliveryDate?: Date;
}

async function notifyShipmentStatusChange(
  shipment: Pick<ShipmentDocument, 'orderId'> & { _id: mongoose.Types.ObjectId },
  status: ShipmentStatus,
) {
  try {
    const order = await OrderModel.findById(shipment.orderId).select('customerId orderNumber').lean();
    if (!order) return;
    const customer = await UserModel.findById(order.customerId).select('email name').lean();
    if (customer?.email) {
      await enqueueNotification({
        channel: 'email',
        templateKey: 'shipment_status_changed',
        recipient: customer.email,
        userId: String(order.customerId),
        data: { orderNumber: order.orderNumber, status, name: customer.name },
      });
    }
  } catch {
    // Notification failures must never block a shipment status update.
  }
}

export async function createShipment(input: CreateShipmentInput, actorId: string) {
  const order = await OrderModel.findById(input.orderId).lean();
  if (!order) throw new NotFoundError('Order');
  if (!SHIPPABLE_ORDER_STATUSES.includes(order.status as OrderStatus)) {
    throw new UnprocessableEntityError(
      `Cannot create a shipment for an order in "${order.status}" status`,
    );
  }

  const shipment = await ShipmentModel.create({
    orderId: order._id,
    deliveryPartnerId: input.deliveryPartnerId ?? null,
    trackingNumber: input.trackingNumber ?? '',
    itemIds: input.itemIds ?? [],
    estimatedDeliveryDate: input.estimatedDeliveryDate ?? null,
    status: SHIPMENT_STATUS.PENDING,
  });

  await recordAudit({
    actorId,
    action: 'create',
    resource: 'shipment',
    resourceId: String(shipment._id),
    after: shipment.toObject(),
  });

  return shipment;
}

export function listShipments(query: ListQuery) {
  return shipmentRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort ?? '-createdAt',
  });
}

export function getShipmentById(id: string) {
  return shipmentRepository.findById(id).then((shipment) => {
    if (!shipment) throw new NotFoundError('Shipment');
    return shipment;
  });
}

/** A single order can have multiple shipments (partial fulfillment), so this returns every shipment raised against the order, most recent first. */
export async function getShipmentsByOrderId(
  orderId: string,
  requester: { id: string; role: string },
) {
  const isStaff = requester.role !== 'customer';
  const order = await OrderModel.findById(orderId).select('customerId').lean();
  if (!order) throw new NotFoundError('Order');
  if (!isStaff && String(order.customerId) !== requester.id) {
    throw new ForbiddenError('You cannot view shipments for this order');
  }

  return ShipmentModel.find({ orderId }).sort({ createdAt: -1 }).lean();
}

/**
 * `actorId` is nullable ( 14 Part 27) so Shiprocket-driven transitions
 * (AWB assignment, webhook status sync) can advance the shipment/order
 * lifecycle without a human actor — see shiprocket-fulfillment.service.ts,
 * the only caller that ever passes `null`. Human-triggered admin status
 * updates keep passing a real actorId exactly as before.
 */
export async function updateShipmentStatus(
  id: string,
  newStatus: ShipmentStatus,
  actorId: string | null,
  extra: { location?: string; remarks?: string } = {},
) {
  const shipment = await ShipmentModel.findById(id);
  if (!shipment) throw new NotFoundError('Shipment');

  const before = shipment.toObject();

  shipment.trackingEvents.push({
    status: newStatus,
    location: extra.location ?? '',
    remarks: extra.remarks ?? '',
    timestamp: new Date(),
  });
  shipment.status = newStatus;

  const now = new Date();
  if (newStatus !== SHIPMENT_STATUS.PENDING && !shipment.dispatchedAt) {
    shipment.dispatchedAt = now;
    shipment.shippedAt = now;
  }
  if (newStatus === SHIPMENT_STATUS.DELIVERED && !shipment.deliveredAt) {
    shipment.deliveredAt = now;
  }

  await shipment.save();

  const mappedOrderStatus = SHIPMENT_TO_ORDER_STATUS[newStatus];
  if (mappedOrderStatus) {
    try {
      await updateOrderStatus(
        String(shipment.orderId),
        mappedOrderStatus,
        actorId,
        `Shipment ${shipment.trackingNumber || shipment._id} moved to "${newStatus}"`,
      );
    } catch {
      // An invalid order-status transition (e.g. the order was already moved
      // manually past this point) must never roll back the shipment update.
    }
  }

  await notifyShipmentStatusChange(shipment, newStatus);

  await recordAudit({
    actorId,
    actorType: actorId ? undefined : ACTOR_TYPES.SYSTEM,
    action: 'update',
    resource: 'shipment',
    resourceId: String(shipment._id),
    before,
    after: shipment.toObject(),
  });

  return shipment;
}

export async function addDeliveryNote(id: string, note: string, actorId: string) {
  const shipment = await ShipmentModel.findById(id);
  if (!shipment) throw new NotFoundError('Shipment');

  const before = shipment.toObject();
  shipment.deliveryNotes = shipment.deliveryNotes
    ? `${shipment.deliveryNotes}\n${note}`
    : note;
  await shipment.save();

  await recordAudit({
    actorId,
    action: 'update',
    resource: 'shipment',
    resourceId: String(shipment._id),
    before,
    after: shipment.toObject(),
  });

  return shipment;
}

/** Delivery report: shipments grouped by status, average delivery time (deliveredAt - dispatchedAt) per delivery partner, and failed/RTO count. */
export async function deliveryReport() {
  const [byStatus, avgDeliveryTimeByPartner, failedOrRtoCount] = await Promise.all([
    ShipmentModel.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    ShipmentModel.aggregate([
      { $match: { deliveredAt: { $ne: null }, dispatchedAt: { $ne: null } } },
      {
        $group: {
          _id: '$deliveryPartnerId',
          avgDeliveryTimeHours: {
            $avg: { $divide: [{ $subtract: ['$deliveredAt', '$dispatchedAt'] }, 1000 * 60 * 60] },
          },
          deliveredCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'deliverypartners',
          localField: '_id',
          foreignField: '_id',
          as: 'partner',
        },
      },
      { $unwind: { path: '$partner', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          deliveryPartnerId: '$_id',
          deliveryPartnerName: '$partner.name',
          avgDeliveryTimeHours: 1,
          deliveredCount: 1,
        },
      },
    ]),
    ShipmentModel.countDocuments({
      status: { $in: [SHIPMENT_STATUS.FAILED, SHIPMENT_STATUS.RTO] },
    }),
  ]);

  return {
    byStatus: byStatus.map((row) => ({ status: row._id, count: row.count })),
    averageDeliveryTimeByPartner: avgDeliveryTimeByPartner,
    failedOrRtoCount,
  };
}
