import {
  ACTOR_TYPES,
  DOCUMENT_STATUS,
  DOCUMENT_TYPES,
  RETURN_AUDIT_ACTIONS,
  SHIPROCKET_STATUS_MAP,
  type ActorType,
  type Role,
} from '@medcommerce/shared';

import { logger } from '../../config/logger';
import { createReturnOrder, generateLabel, trackByAwb } from '../../integrations/shiprocket/shiprocket.api';
import { getShiprocketPickupLocationName, isShiprocketConfigured } from '../../integrations/shiprocket/shiprocket.client';
import { UnprocessableEntityError } from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { uploadAndRecordDocument } from '../documents/document-storage.helper';
import { WarehouseModel } from '../inventory/models/warehouse.model';

import { OrderModel } from './models/order.model';
import { ReturnModel, type ReturnDocument } from './models/return.model';

/**
 * Part 13 — the abstraction boundary SHIP-05 asked for: everything
 * Shiprocket-reverse-pickup-specific lives here, so return.service.ts never
 * imports the Shiprocket SDK/client directly. If a different reverse-
 * logistics provider is added later, only this file changes.
 *
 * Deliberately reuses the SAME credential/auth/retry machinery as the
 * forward-shipment integration (shiprocket.client.ts) — no second Shiprocket
 * client, no separate credential store (Part 13).
 */

type Actor = { id: string | null; role?: Role };

function resolveActorType(actor: Actor): ActorType | undefined {
  if (actor.role) return actorTypeForRole(actor.role);
  return actor.id ? undefined : ACTOR_TYPES.SYSTEM;
}

function safeUnavailableError(): UnprocessableEntityError {
  return new UnprocessableEntityError('Return shipment processing is temporarily unavailable.');
}

/**
 * Creates the reverse-pickup shipment for an APPROVED return — idempotent
 * (a return whose `reverseShipment.shiprocketOrderId` is already set is
 * returned unchanged, never re-created — Part 40). Pickup address = the
 * customer's original shipping address (Part 11: "mirroring the forward
 * shipment with addresses swapped"); delivery address = the return's
 * resolved receiving warehouse.
 */
export async function createReverseShipmentForReturn(
  returnId: string,
  actor: Actor,
): Promise<ReturnDocument & { _id: unknown }> {
  const ret = await ReturnModel.findById(returnId);
  if (!ret) throw new UnprocessableEntityError('Return not found');
  if (ret.reverseShipment?.shiprocketOrderId) return ret; // already created — idempotent no-op.

  const actorType = resolveActorType(actor);

  if (!(await isShiprocketConfigured())) {
    logger.warn({ returnId }, 'Reverse-pickup skipped — Shiprocket not configured');
    ret.set('reverseShipment.lastError', 'Shiprocket is not configured');
    await ret.save();
    throw safeUnavailableError();
  }

  const order = await OrderModel.findById(ret.orderId);
  if (!order?.shippingAddress) throw new UnprocessableEntityError('Order shipping address is unavailable');
  if (!ret.warehouseId) throw new UnprocessableEntityError('Return has no receiving warehouse resolved');

  const warehouse = await WarehouseModel.findById(ret.warehouseId).lean();
  if (!warehouse) throw new UnprocessableEntityError('Receiving warehouse not found');

  const pickupLocation = await getShiprocketPickupLocationName();
  if (!pickupLocation) {
    ret.set('reverseShipment.lastError', 'No Shiprocket pickup location configured');
    await ret.save();
    throw safeUnavailableError();
  }

  const address = order.shippingAddress;
  const orderItemMap = new Map(order.items.map((i) => [String(i._id), i]));

  try {
    const result = await createReturnOrder({
      order_id: `RET-${String(ret._id)}`,
      order_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
      // Pickup = FROM the customer (this is a reverse pickup).
      pickup_customer_name: address.name,
      pickup_address: address.line1,
      pickup_city: address.city,
      pickup_state: address.state,
      pickup_country: 'India',
      pickup_pincode: address.pincode,
      pickup_email: '',
      pickup_phone: address.phone,
      // Shipping/delivery = TO the receiving warehouse.
      shipping_customer_name: warehouse.name,
      shipping_address: warehouse.address || warehouse.name,
      shipping_city: warehouse.city || '',
      shipping_state: warehouse.state || '',
      shipping_country: 'India',
      shipping_pincode: warehouse.pincode || '',
      shipping_email: warehouse.contactEmail || '',
      shipping_phone: warehouse.contactPhone || '9999999999',
      order_items: ret.items.map((item) => {
        const orderItem = orderItemMap.get(String(item.orderItemId));
        return {
          name: item.name || orderItem?.name || 'Item',
          sku: item.sku || orderItem?.sku || 'SKU',
          units: item.quantity,
          selling_price: item.unitPrice || orderItem?.unitPrice || 0,
        };
      }),
      payment_method: 'Prepaid',
      sub_total: ret.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
      length: 10,
      breadth: 10,
      height: 10,
      weight: 0.5,
    });

    ret.set('reverseShipment.shiprocketOrderId', String(result.order_id));
    ret.set('reverseShipment.shiprocketShipmentId', String(result.shipment_id));
    ret.set('reverseShipment.status', result.status ?? '');
    ret.set('reverseShipment.lastError', '');
    await ret.save();

    await recordAudit({
      actorId: actor.id,
      actorType,
      action: RETURN_AUDIT_ACTIONS.RETURN_SHIPMENT_CREATED,
      resource: 'return',
      resourceId: String(ret._id),
      after: { shiprocketOrderId: String(result.order_id) },
    });

    return ret;
  } catch (error) {
    ret.set('reverseShipment.lastError', error instanceof Error ? error.message.slice(0, 500) : 'Reverse pickup creation failed');
    await ret.save();
    await recordAudit({
      actorId: actor.id,
      actorType,
      action: RETURN_AUDIT_ACTIONS.RETURN_SHIPMENT_CREATION_FAILED,
      resource: 'return',
      resourceId: String(ret._id),
      metadata: { reason: ret.reverseShipment?.lastError },
    });
    throw safeUnavailableError();
  }
}

/** Fetches + persists the reverse-pickup label through the SAME StorageService pipeline forward labels use — Part 14/46, a distinct documentType (RETURN_LABEL) so it's never confused with the outbound shipment's label. */
export async function fetchAndStoreReturnLabel(
  returnId: string,
  actor: Actor,
): Promise<ReturnDocument & { _id: unknown }> {
  const ret = await ReturnModel.findById(returnId);
  if (!ret) throw new UnprocessableEntityError('Return not found');
  if (ret.reverseShipment?.labelUrl) return ret;
  if (!ret.reverseShipment?.shiprocketShipmentId) {
    throw new UnprocessableEntityError('Reverse shipment has not been created yet');
  }

  try {
    const result = await generateLabel(ret.reverseShipment.shiprocketShipmentId);
    if (!result.label_created || !result.label_url) throw new Error('Shiprocket did not return a label');

    const pdfRes = await fetch(result.label_url);
    if (!pdfRes.ok) throw new Error('Failed to download generated return label');
    const buffer = Buffer.from(await pdfRes.arrayBuffer());

    const { ref, storageProvider } = await uploadAndRecordDocument({
      documentType: DOCUMENT_TYPES.RETURN_LABEL,
      entityId: String(ret._id),
      objectKeyId: String(ret._id),
      sellerId: ret.sellerId ? String(ret.sellerId) : null,
      buffer,
      fileName: `return-label-${ret._id}.pdf`,
    });

    ret.set('reverseShipment.labelUrl', ref);
    ret.set('reverseShipment.storageProvider', storageProvider);
    ret.set('reverseShipment.documentStatus', DOCUMENT_STATUS.AVAILABLE);
    await ret.save();

    await recordAudit({
      actorId: actor.id,
      actorType: resolveActorType(actor),
      action: RETURN_AUDIT_ACTIONS.RETURN_SHIPMENT_CREATED,
      resource: 'return',
      resourceId: String(ret._id),
      metadata: { labelGenerated: true },
    });

    return ret;
  } catch (error) {
    ret.set('reverseShipment.documentStatus', DOCUMENT_STATUS.FAILED);
    ret.set('reverseShipment.lastError', error instanceof Error ? error.message.slice(0, 500) : 'Return label generation failed');
    await ret.save();
    throw safeUnavailableError();
  }
}

/** Manual/on-demand tracking pull for the reverse shipment — mirrors shiprocket-fulfillment.service.ts's syncShipmentTracking, mapped onto the return's own status field (never the forward Shipment). */
export async function syncReturnShipmentTracking(
  returnId: string,
  actor: Actor,
): Promise<ReturnDocument & { _id: unknown }> {
  const ret = await ReturnModel.findById(returnId);
  if (!ret) throw new UnprocessableEntityError('Return not found');
  if (!ret.reverseShipment?.awbCode) return ret;

  try {
    const result = await trackByAwb(ret.reverseShipment.awbCode);
    const statusRaw =
      result.tracking_data?.shipment_status ??
      result.tracking_data?.shipment_track?.[0]?.current_status ??
      '';
    if (statusRaw) {
      ret.set('reverseShipment.shiprocketStatusRaw', statusRaw);
      const mapped = SHIPROCKET_STATUS_MAP[statusRaw.toLowerCase().trim()];
      ret.set('reverseShipment.status', mapped || statusRaw);
      ret.reverseShipment?.trackingEvents?.push({
        status: mapped || statusRaw,
        remarks: statusRaw,
        timestamp: new Date(),
      });
    }
    await ret.save();

    await recordAudit({
      actorId: actor.id,
      actorType: resolveActorType(actor),
      action: RETURN_AUDIT_ACTIONS.RETURN_PICKED_UP,
      resource: 'return',
      resourceId: String(ret._id),
      metadata: { statusRaw },
    });

    return ret;
  } catch (error) {
    logger.warn({ returnId, err: error }, 'Return shipment tracking sync failed');
    throw safeUnavailableError();
  }
}
