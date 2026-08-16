import {
  ACTOR_TYPES,
  DOCUMENT_STATUS,
  DOCUMENT_TYPES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  SHIPMENT_AUDIT_ACTIONS,
  SHIPMENT_STATUS,
  SHIPROCKET_STATUS_MAP,
  STORAGE_PROVIDERS,
  type ActorType,
  type Role,
  type ShipmentStatus,
} from '@medcommerce/shared';
import mongoose from 'mongoose';

import { logger } from '../../config/logger';
import { s3Ops } from '../../integrations/s3/s3-ops';
import {
  addPickupLocation,
  assignAwb,
  checkServiceability,
  createShiprocketOrder,
  generateLabel,
  listPickupLocations,
  requestPickup,
  trackByAwb,
  type CreateShiprocketOrderPayload,
} from '../../integrations/shiprocket/shiprocket.api';
import {
  getShiprocketPickupLocationName,
  isShiprocketConfigured,
} from '../../integrations/shiprocket/shiprocket.client';
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { UserModel } from '../auth/models/user.model';
import { calculateShippingCharge } from '../delivery/shipping-calculation.service';
import { uploadAndRecordDocument } from '../documents/document-storage.helper';
import { WarehouseModel } from '../inventory/models/warehouse.model';
import { InvoiceModel } from '../invoices/models/invoice.model';

import { OrderModel, type OrderDocument } from './models/order.model';
import { ShipmentModel, type ShipmentDocument } from './models/shipment.model';
import { ShiprocketWebhookLogModel } from './models/shiprocket-webhook-log.model';
import { resolveFulfillingWarehouse, resolveOrderPackageSpec } from './order-fulfillment.util';
import { updateShipmentStatus } from './shipment.service';

/** Never leak raw Shiprocket API responses, credentials, or internal errors to a customer/generic caller (Part 31). */
function safeUnavailableError(): UnprocessableEntityError {
  return new UnprocessableEntityError('Shipment processing is temporarily unavailable.');
}

/**
 * Bugfix (Order/Shiprocket/Invoice) Part 4 — marks an error as a PERMANENT
 * data/precondition problem (missing address, order not packed yet, invoice
 * not generated yet, no fulfilling warehouse) rather than a transient
 * integration failure. `shipment.worker.ts` checks this flag to decide
 * whether BullMQ should keep retrying (transient — network/5xx/timeout) or
 * stop immediately (permanent — retrying the identical job won't change the
 * outcome; the order needs a state change, which independently re-enqueues
 * a NEW job when it happens). Deliberately just an extra property on the
 * SAME error classes already thrown here (not a new Error subclass and not
 * a changed message) — these same throws also surface through the
 * admin-facing manual "retry shipment" HTTP route via `retryShipmentFulfillment`,
 * and must keep mapping to their existing 404/422/403 status codes there.
 */
function markPermanent<E extends Error>(err: E): E {
  return Object.assign(err, { permanent: true as const });
}

export function isPermanentFulfillmentFailure(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { permanent?: unknown }).permanent === true);
}

type Actor = { id: string | null; role?: Role };

function resolveActorType(actor: Actor): ActorType | undefined {
  if (actor.role) return actorTypeForRole(actor.role);
  return actor.id ? undefined : ACTOR_TYPES.SYSTEM;
}

/** Order statuses eligible to receive a Shiprocket shipment — mirrors shipment.service.ts's SHIPPABLE_ORDER_STATUSES but narrowed to "packed and not yet dispatched", since Shiprocket order creation is what MOVES it toward dispatch, not something done after. */
const SHIPROCKET_ELIGIBLE_STATUSES = [ORDER_STATUS.PACKED, ORDER_STATUS.READY_FOR_DISPATCH];

interface FulfillmentContext {
  order: OrderDocument & { _id: unknown };
  invoiceId: string;
  warehouse: NonNullable<Awaited<ReturnType<typeof resolveFulfillingWarehouse>>>;
  customerEmail: string;
}

/**
 * Resolves and validates everything needed to build a Shiprocket order from
 * authoritative, already-persisted data (Part 4): the order itself, its
 * (already-generated) invoice, and its fulfilling warehouse — with the
 * seller/warehouse ownership check from Part 5.
 */
async function resolveFulfillmentContext(orderId: string): Promise<FulfillmentContext> {
  const order = await OrderModel.findById(orderId);
  if (!order) throw markPermanent(new NotFoundError('Order'));

  if (!SHIPROCKET_ELIGIBLE_STATUSES.includes(order.status as (typeof SHIPROCKET_ELIGIBLE_STATUSES)[number])) {
    throw markPermanent(
      new UnprocessableEntityError(
        `Order must be packed before a shipment can be created (current status "${order.status}")`,
      ),
    );
  }

  // Part 12 — never ship an order whose authoritative invoice doesn't exist
  // yet (paid-order + invoice dependency, both in one check: invoice
  // generation itself only ever runs for packed orders — see order.service.ts).
  const invoice = await InvoiceModel.findOne({ orderId: order._id }).select('_id pdfUrl').lean();
  if (!invoice || !invoice.pdfUrl) {
    throw markPermanent(
      new UnprocessableEntityError(
        'Cannot create a shipment before the invoice has been generated for this order',
      ),
    );
  }

  const warehouse = await resolveFulfillingWarehouse(order);
  if (!warehouse) {
    throw markPermanent(new UnprocessableEntityError('No fulfilling warehouse could be resolved for this order'));
  }

  // Part 5 — hard integrity check: never let a warehouse belonging to a
  // different seller become a shipment's pickup origin.
  if (order.sellerId && String(warehouse.sellerId) !== String(order.sellerId)) {
    throw markPermanent(new ForbiddenError("Resolved warehouse does not belong to the order's seller"));
  }

  const customer = await UserModel.findById(order.customerId).select('email').lean();

  return {
    order: order as OrderDocument & { _id: unknown },
    invoiceId: String(invoice._id),
    warehouse,
    customerEmail: customer?.email ?? '',
  };
}

/** In-process cache of pickup-location names already confirmed registered on the Shiprocket account — avoids a list-API round-trip on every shipment once confirmed. */
const confirmedPickupLocations = new Set<string>();

/**
 * Bugfix (Order/Shiprocket/Invoice) Part 3 root cause — `createShiprocketOrder`
 * always sent `pickup_location: "Primary"` (or whatever
 * `SHIPROCKET_PICKUP_LOCATION` is configured to), but nothing anywhere in
 * this codebase ever registered a pickup location with that name on the
 * Shiprocket account itself (`addPickupLocation` existed in
 * shiprocket.api.ts but was never called). Shiprocket's `/orders/create/adhoc`
 * rejects an order referencing an unregistered pickup location with the
 * generic, misleading "Please add billing/shipping address first" —
 * reproduced live and confirmed via the sanitized error-body logging (Part 8)
 * that this, not a genuinely missing customer address, is what NEW orders
 * were actually hitting. Idempotent get-or-create, exactly mirroring the
 * Cloudinary upload-preset fix (cloudinary.service.ts's `ensureUploadPreset`).
 *
 * Deliberately does NOT fabricate missing warehouse fields — if the
 * fulfilling warehouse itself is missing the address/contact fields
 * Shiprocket's registration API requires (`warehouse.address`,
 * `.contactPhone`, `.contactEmail` — added specifically for this purpose,
 * see warehouse.model.ts's own comment — but not necessarily filled in by
 * every admin yet), that's surfaced as a clear, actionable, PERMANENT error
 * naming the warehouse and the missing fields, not silently worked around
 * with placeholder data (Part 1/2's "no fallback address" principle applies
 * here too, just for warehouse config instead of customer addresses).
 */
async function ensurePickupLocation(
  pickupLocation: string,
  warehouse: FulfillmentContext['warehouse'],
): Promise<void> {
  if (confirmedPickupLocations.has(pickupLocation)) return;

  const existing = await listPickupLocations();
  if (existing.some((loc) => loc.pickup_location === pickupLocation)) {
    confirmedPickupLocations.add(pickupLocation);
    return;
  }

  const missingFields = (
    [
      ['address', warehouse.address],
      ['city', warehouse.city],
      ['state', warehouse.state],
      ['pincode', warehouse.pincode],
      ['contactPhone', warehouse.contactPhone],
      ['contactEmail', warehouse.contactEmail],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([field]) => field);

  if (missingFields.length > 0) {
    throw markPermanent(
      new UnprocessableEntityError(
        `Cannot register Shiprocket pickup location "${pickupLocation}" — warehouse "${warehouse.name}" is missing: ${missingFields.join(', ')}. Update the warehouse in Admin > Warehouses.`,
      ),
    );
  }

  await addPickupLocation({
    pickup_location: pickupLocation,
    name: warehouse.name,
    email: warehouse.contactEmail,
    phone: warehouse.contactPhone,
    address: warehouse.address,
    city: warehouse.city,
    state: warehouse.state,
    country: 'India',
    pin_code: warehouse.pincode,
  });
  confirmedPickupLocations.add(pickupLocation);
  logger.info({ pickupLocation, warehouseId: String(warehouse._id) }, 'Auto-registered Shiprocket pickup location');
}

function buildShiprocketPayload(
  ctx: FulfillmentContext,
  pickupLocation: string,
  packageSpec: Awaited<ReturnType<typeof resolveOrderPackageSpec>>,
): CreateShiprocketOrderPayload {
  const { order } = ctx;
  const address = order.shippingAddress;
  if (!address) throw markPermanent(new UnprocessableEntityError('Order is missing a shipping address'));
  // mm -> cm (Shiprocket's documented unit), floored at 1cm/0.01kg so a
  // shipment with incomplete product dimension/weight data never gets sent
  // as a literal zero (Shiprocket rejects zero dimensions/weight outright).
  const weightKg = Math.max(packageSpec.weightGrams / 1000, 0.01);

  return {
    order_id: order.orderNumber,
    order_date: new Date().toISOString().slice(0, 19).replace('T', ' '),
    pickup_location: pickupLocation,
    billing_customer_name: address.name,
    // Bugfix (Order/Shiprocket/Invoice) Part 3 — Shiprocket's live API
    // rejects a request omitting this key entirely with `{"billing_last_name":
    // ["validation.present"]}` (reproduced live). It only requires the KEY to
    // be present, not non-empty (Laravel's "present" rule, distinct from
    // "required") — this codebase has no first/last-name split anywhere
    // (`address.name` is the customer's one full account name, see
    // order.service.ts), so guessing a split would risk mangling real names
    // for no benefit; sending it empty satisfies Shiprocket without
    // fabricating data `billing_customer_name` already carries correctly.
    billing_last_name: '',
    billing_address: address.line1,
    billing_address_2: address.line2 || '',
    billing_city: address.city,
    billing_pincode: address.pincode,
    billing_state: address.state,
    billing_country: 'India',
    billing_email: ctx.customerEmail,
    billing_phone: address.phone,
    shipping_is_billing: true,
    order_items: order.items.map((item) => ({
      name: item.name,
      sku: item.sku,
      units: item.quantity,
      selling_price: item.unitPrice,
      tax: item.gstRate,
    })),
    payment_method: order.paymentStatus === PAYMENT_STATUS.CAPTURED ? 'Prepaid' : 'COD',
    sub_total: order.totals?.grandTotal ?? 0,
    length: Math.max(packageSpec.dimensions.lengthMm / 10, 1),
    breadth: Math.max(packageSpec.dimensions.widthMm / 10, 1),
    height: Math.max(packageSpec.dimensions.heightMm / 10, 1),
    weight: Math.round(weightKg * 1000) / 1000,
  };
}

/**
 * Creates (or, per Part 15/26, reuses) the Shiprocket order + shipment for an
 * internal Order. Idempotent: if a Shipment already carries a
 * `shiprocketOrderId` for this order, it's returned unchanged — no duplicate
 * external order is ever created, whether this is called by the automated
 * post-invoice job (SYSTEM) or an admin retry.
 */
export async function createShiprocketOrderForOrder(
  orderId: string,
  actor: Actor,
): Promise<ShipmentDocument & { _id: unknown }> {
  const actorType = resolveActorType(actor);

  const existing = await ShipmentModel.findOne({ orderId });
  if (existing?.shiprocketOrderId) return existing;

  // Context resolution failures (order not packed yet, invoice missing,
  // warehouse/seller ownership mismatch — Part 5/12) are real validation
  // errors about the ORDER, not a Shiprocket API failure — thrown directly,
  // no Shipment shell is created for them (there's nothing legitimate to
  // retry until the order itself reaches a valid state).
  const ctx = await resolveFulfillmentContext(orderId);
  const packageSpec = await resolveOrderPackageSpec(ctx.order);
  if (packageSpec.coldStorageRequired) {
    // Part 8 — surfaced, not silently ignored. No cold-chain courier network
    // exists in this build, so ordinary shipment still proceeds; the flag is
    // persisted on the Shipment record for admin visibility / future
    // cold-chain courier routing.
    logger.warn({ orderId }, 'Order requires cold storage — no cold-chain courier configured, shipping via standard courier');
  }

  // From here on, the order IS eligible — a Shipment shell always gets
  // persisted (Part 26: a failed attempt must be visible/retryable in the
  // admin UI, not silently swallowed before any record exists).
  const shipment =
    existing ??
    (await ShipmentModel.create({
      orderId: ctx.order._id,
      sellerId: ctx.order.sellerId,
      warehouseId: ctx.warehouse._id,
      invoiceId: ctx.invoiceId,
      weightGrams: packageSpec.weightGrams,
      dimensions: packageSpec.dimensions,
      coldStorageRequired: packageSpec.coldStorageRequired,
      status: SHIPMENT_STATUS.PENDING,
    }));

  if (!(await isShiprocketConfigured())) {
    logger.warn({ orderId }, 'Shiprocket create-order skipped — integration not configured');
    shipment.lastError = 'Shiprocket is not configured';
    await shipment.save();
    throw safeUnavailableError();
  }

  const pickupLocation = await getShiprocketPickupLocationName();
  if (!pickupLocation) {
    logger.warn({ orderId }, 'Shiprocket create-order skipped — no pickup location configured');
    shipment.lastError = 'No Shiprocket pickup location configured';
    await shipment.save();
    throw safeUnavailableError();
  }

  try {
    await ensurePickupLocation(pickupLocation, ctx.warehouse);
  } catch (error) {
    shipment.lastError =
      error instanceof Error ? error.message.slice(0, 500) : 'Pickup location registration failed';
    await shipment.save().catch(() => undefined);
    if (isPermanentFulfillmentFailure(error)) throw error;
    logger.error({ orderId, pickupLocation, err: error }, 'Failed to verify/register Shiprocket pickup location');
    throw safeUnavailableError();
  }

  const payload = buildShiprocketPayload(ctx, pickupLocation, packageSpec);

  try {
    const result = await createShiprocketOrder(payload);

    shipment.sellerId = ctx.order.sellerId;
    shipment.warehouseId = ctx.warehouse._id;
    shipment.invoiceId = new mongoose.Types.ObjectId(ctx.invoiceId);
    shipment.weightGrams = packageSpec.weightGrams;
    shipment.dimensions = packageSpec.dimensions;
    shipment.coldStorageRequired = packageSpec.coldStorageRequired;
    shipment.shiprocketOrderId = String(result.order_id);
    shipment.shiprocketShipmentId = String(result.shipment_id);
    shipment.shiprocketStatusRaw = result.status ?? '';
    shipment.lastError = '';

    try {
      await shipment.save();
    } catch (saveError) {
      // Race: another concurrent call for the same order already won and
      // persisted the same shiprocketOrderId (the sparse-unique index on
      // that field caught it) — Shiprocket itself is idempotent on our
      // `order_id`, so both calls resolved to the SAME external order; drop
      // this duplicate local shell and return the winner instead of erroring.
      if ((saveError as { code?: number }).code === 11000) {
        await ShipmentModel.deleteOne({ _id: shipment._id });
        const winner = await ShipmentModel.findOne({ shiprocketOrderId: shipment.shiprocketOrderId });
        if (winner) return winner;
      }
      throw saveError;
    }

    await recordAudit({
      actorId: actor.id,
      actorType,
      action: SHIPMENT_AUDIT_ACTIONS.SYSTEM_CREATED_SHIPROCKET_ORDER,
      resource: 'shipment',
      resourceId: String(shipment._id),
      after: {
        shiprocketOrderId: shipment.shiprocketOrderId,
        shiprocketShipmentId: shipment.shiprocketShipmentId,
      },
    });

    return shipment;
  } catch (error) {
    shipment.lastError =
      error instanceof Error ? error.message.slice(0, 500) : 'Shiprocket order creation failed';
    await shipment.save().catch(() => undefined);
    // Part 8 — this catch previously relied entirely on `shiprocketRequest`'s
    // own log call for HTTP-layer failures, so a failure at THIS level (e.g.
    // the `shipment.save()` above, or a non-HTTP error) had no log line at
    // all beyond the generic BullMQ 'failed' event (which only has the job
    // id, not the order/shipment id or the actual reason).
    logger.error(
      { orderId, shipmentId: String(shipment._id), reason: shipment.lastError },
      'Shiprocket order creation failed',
    );
    await recordAudit({
      actorId: actor.id,
      actorType,
      action: SHIPMENT_AUDIT_ACTIONS.SHIPMENT_CREATION_FAILED,
      resource: 'shipment',
      resourceId: String(shipment._id),
      metadata: { reason: shipment.lastError },
    });
    throw safeUnavailableError();
  }
}

/**
 * Assigns AWB + courier (Part 17/18) and requests pickup for a shipment that
 * already has a Shiprocket order. Idempotent: a shipment that already has an
 * `awbCode` is returned unchanged rather than re-assigned.
 */
export async function assignAwbForShipment(
  shipmentId: string,
  actor: Actor,
): Promise<ShipmentDocument & { _id: unknown }> {
  const shipment = await ShipmentModel.findById(shipmentId);
  if (!shipment) throw markPermanent(new NotFoundError('Shipment'));
  if (shipment.awbCode) return shipment;
  if (!shipment.shiprocketShipmentId) {
    throw markPermanent(new UnprocessableEntityError('Shipment has not been created with Shiprocket yet'));
  }

  const actorType = resolveActorType(actor);

  try {
    const result = await assignAwb(shipment.shiprocketShipmentId);
    const data = result.response?.data;
    if (result.awb_assign_status !== 1 || !data?.awb_code) {
      throw new Error('Shiprocket did not return an AWB code');
    }

    shipment.awbCode = data.awb_code;
    shipment.courierId = data.courier_company_id ? String(data.courier_company_id) : '';
    shipment.courierName = data.courier_name ?? '';
    shipment.lastError = '';
    await shipment.save();

    await recordAudit({
      actorId: actor.id,
      actorType,
      action: SHIPMENT_AUDIT_ACTIONS.SYSTEM_ASSIGNED_AWB,
      resource: 'shipment',
      resourceId: String(shipment._id),
      after: { awbCode: shipment.awbCode, courierName: shipment.courierName },
    });

    // Reuses the EXISTING status-transition path (trackingEvents + order
    // status sync + notification + audit — shipment.service.ts) rather than
    // duplicating any of that logic here.
    await updateShipmentStatus(String(shipment._id), SHIPMENT_STATUS.READY_FOR_DISPATCH, actor.id, {
      remarks: `AWB ${shipment.awbCode} assigned (${shipment.courierName || 'auto-selected courier'})`,
    });

    try {
      const pickup = await requestPickup(shipment.shiprocketShipmentId);
      if (pickup.pickup_status === 1) {
        shipment.pickupScheduledAt = new Date();
        await shipment.save();
      }
    } catch (pickupError) {
      // Pickup-scheduling failure is non-fatal — AWB is already assigned;
      // surfaced via lastError for admin retry, doesn't roll back the AWB.
      logger.warn({ shipmentId, err: pickupError }, 'Shiprocket pickup scheduling failed');
    }

    return await ShipmentModel.findById(shipmentId).then((s) => s!);
  } catch (error) {
    shipment.lastError = error instanceof Error ? error.message.slice(0, 500) : 'AWB assignment failed';
    await shipment.save();
    await recordAudit({
      actorId: actor.id,
      actorType,
      action: SHIPMENT_AUDIT_ACTIONS.SHIPMENT_CREATION_FAILED,
      resource: 'shipment',
      resourceId: String(shipment._id),
      metadata: { reason: shipment.lastError },
    });
    throw safeUnavailableError();
  }
}

/**
 * Fetches the shipping label from Shiprocket and re-uploads it through the
 * centralized storage abstraction (Prompt 15 Part 1/7 — S3 when configured,
 * falling back to the pre-existing Cloudinary path otherwise; see
 * document-storage.helper.ts) — never stored as raw binary in MongoDB and
 * never depends on Shiprocket's own externally-hosted URL staying valid
 * indefinitely.
 */
export async function fetchAndStoreLabel(
  shipmentId: string,
  actor: Actor,
): Promise<ShipmentDocument & { _id: unknown }> {
  const shipment = await ShipmentModel.findById(shipmentId);
  if (!shipment) throw new NotFoundError('Shipment');
  if (shipment.labelUrl) {
    // Prompt 27 Part 20/38 — same transparent expired-object recovery the
    // invoice download path uses (invoice.service.ts's
    // ensureInvoicePdfAvailable): a label whose DB record still points at
    // an S3 key the retention sweep already deleted falls through and
    // re-requests the label from Shiprocket using the SAME
    // shiprocketShipmentId (Part 20 — "use the provider shipment
    // identifiers stored in DB"), rather than ever creating a new shipment.
    const stillAvailable =
      shipment.storageProvider !== STORAGE_PROVIDERS.S3 ||
      (shipment.documentStatus !== DOCUMENT_STATUS.EXPIRED && (await s3Ops.objectExists(shipment.labelUrl)));
    if (stillAvailable) return shipment;
  }
  if (!shipment.shiprocketShipmentId) {
    throw new UnprocessableEntityError('Shipment has not been created with Shiprocket yet');
  }

  const actorType = resolveActorType(actor);

  try {
    const result = await generateLabel(shipment.shiprocketShipmentId);
    if (!result.label_created || !result.label_url) {
      throw new Error('Shiprocket did not return a label');
    }

    const pdfRes = await fetch(result.label_url);
    if (!pdfRes.ok) throw new Error('Failed to download generated label');
    const buffer = Buffer.from(await pdfRes.arrayBuffer());

    const { ref, storageProvider } = await uploadAndRecordDocument({
      documentType: DOCUMENT_TYPES.SHIPPING_LABEL,
      entityId: String(shipment._id),
      objectKeyId: String(shipment._id),
      sellerId: shipment.sellerId ? String(shipment.sellerId) : null,
      buffer,
      fileName: `label-${shipment._id}.pdf`,
    });

    shipment.labelUrl = ref;
    shipment.storageProvider = storageProvider;
    shipment.documentStatus = DOCUMENT_STATUS.AVAILABLE;
    shipment.lastError = '';
    await shipment.save();

    await recordAudit({
      actorId: actor.id,
      actorType,
      action: SHIPMENT_AUDIT_ACTIONS.SYSTEM_GENERATED_LABEL,
      resource: 'shipment',
      resourceId: String(shipment._id),
      after: { labelUrl: shipment.labelUrl },
    });

    return shipment;
  } catch (error) {
    shipment.lastError = error instanceof Error ? error.message.slice(0, 500) : 'Label generation failed';
    shipment.documentStatus = DOCUMENT_STATUS.FAILED;
    await shipment.save();
    throw safeUnavailableError();
  }
}

/**
 * Manual/on-demand tracking pull (Part 21) — used by the admin "refresh
 * tracking" action for shipments whose courier hasn't (yet) delivered a
 * webhook update, or when webhooks aren't configured for this deployment.
 * Reuses the same SHIPROCKET_STATUS_MAP + updateShipmentStatus path as the
 * webhook handler so both routes converge on identical internal behavior.
 */
export async function syncShipmentTracking(
  shipmentId: string,
  actor: Actor,
): Promise<ShipmentDocument & { _id: unknown }> {
  const shipment = await ShipmentModel.findById(shipmentId);
  if (!shipment) throw new NotFoundError('Shipment');
  if (!shipment.awbCode) return shipment;

  try {
    const result = await trackByAwb(shipment.awbCode);
    const statusRaw =
      result.tracking_data?.shipment_status ??
      result.tracking_data?.shipment_track?.[0]?.current_status ??
      '';
    if (statusRaw) shipment.shiprocketStatusRaw = statusRaw;
    await shipment.save();

    const mappedStatus = SHIPROCKET_STATUS_MAP[statusRaw.toLowerCase().trim()] as
      | ShipmentStatus
      | undefined;
    if (mappedStatus && mappedStatus !== shipment.status) {
      await updateShipmentStatus(shipmentId, mappedStatus, actor.id, {
        remarks: `Tracking sync: ${statusRaw}`,
      });
    }

    await recordAudit({
      actorId: actor.id,
      actorType: resolveActorType(actor),
      action: SHIPMENT_AUDIT_ACTIONS.SYSTEM_UPDATED_TRACKING,
      resource: 'shipment',
      resourceId: String(shipment._id),
      metadata: { statusRaw },
    });

    return (await ShipmentModel.findById(shipmentId)) ?? shipment;
  } catch (error) {
    logger.warn({ shipmentId, err: error }, 'Shiprocket tracking sync failed');
    throw safeUnavailableError();
  }
}

/**
 * Retry entry point (Part 26): always synchronizes with whatever Shiprocket
 * state already exists rather than blindly re-creating. Safe to call
 * repeatedly — every step it drives through is itself idempotent.
 */
export async function retryShipmentFulfillment(orderId: string, actor: Actor) {
  const shipment = await createShiprocketOrderForOrder(orderId, actor);
  await recordAudit({
    actorId: actor.id,
    actorType: resolveActorType(actor),
    action: SHIPMENT_AUDIT_ACTIONS.ADMIN_RETRIED_SHIPMENT,
    resource: 'shipment',
    resourceId: String(shipment._id),
  });
  if (!shipment.awbCode) {
    await assignAwbForShipment(String(shipment._id), actor);
  }
  return ShipmentModel.findById(shipment._id);
}

/**
 * Backend-only PIN-code serviceability check (Part 2). Deliberately never
 * lets checkout depend on Shiprocket being reachable: the existing
 * ShippingZone/ShippingRule engine (shipping-calculation.service.ts) remains
 * the authoritative source for "is this deliverable and what does it cost"
 * (Part 3 — "existing configuration must remain the source of configurable
 * shipping rules"); Shiprocket, when configured, only ENRICHES the response
 * with live courier ETA/serviceability data on a best-effort basis.
 */
export async function checkPincodeServiceability(params: {
  pincode: string;
  sellerId?: string;
  subtotal?: number;
  state?: string;
  totalWeightGrams?: number;
}) {
  const shippingCharge = await calculateShippingCharge({
    subtotal: params.subtotal ?? 0,
    state: params.state ?? '',
    pincode: params.pincode,
    totalWeightGrams: params.totalWeightGrams,
  });

  const base = {
    pincode: params.pincode,
    available: true,
    shippingCharge,
    estimatedDeliveryDate: null as string | null,
    couriers: [] as { name: string; etd?: string }[],
  };

  if (!(await isShiprocketConfigured())) return base;

  try {
    const warehouse = params.sellerId
      ? await WarehouseModel.findOne({ sellerId: params.sellerId, deletedAt: null }).lean()
      : null;
    const pickupPincode = warehouse?.pincode;
    if (!pickupPincode) return base;

    const result = await checkServiceability({
      pickupPincode,
      deliveryPincode: params.pincode,
      weightKg: Math.max((params.totalWeightGrams ?? 500) / 1000, 0.01),
      cod: false,
    });

    const couriers = result.data?.available_courier_companies ?? [];
    return {
      ...base,
      available: couriers.length > 0,
      estimatedDeliveryDate: couriers[0]?.etd ?? null,
      couriers: couriers.map((c) => ({ name: c.courier_name, etd: c.etd })),
    };
  } catch (err) {
    // Shiprocket being unreachable/misconfigured must never block checkout —
    // fall back to the zone/rule-based answer already computed above. `err`
    // (not `error`) so pino actually serializes the message/stack.
    logger.warn({ err }, 'Shiprocket serviceability check failed — falling back to configured zones/rules');
    return base;
  }
}

export interface CheckoutServiceabilityResult {
  serviceable: boolean;
  // Bugfix (Human-Readable API Logging) Part 8 — `authentication_failed` is
  // now its own reason, distinct from the generic `api_unreachable`: Shiprocket
  // rejecting OUR credentials is an integration/config problem that never
  // asked Shiprocket about this pincode at all, same category as
  // `not_configured`/`no_warehouse` — but worth telling apart from a plain
  // network timeout in logs, since it typically means credentials were
  // rotated/revoked and needs an admin to act, not just "retry later."
  reason?: 'not_configured' | 'no_warehouse' | 'no_couriers' | 'authentication_failed' | 'api_unreachable';
}

/** Shiprocket's low-level client (shiprocket.client.ts) throws this exact message when its OWN /auth/login call fails — distinguishes "Shiprocket rejected our credentials" from any other failure (network, 5xx, timeout) without the client needing to expose a typed error class across the module boundary. */
function isShiprocketAuthFailure(err: unknown): boolean {
  return err instanceof Error && err.message === 'Shiprocket authentication failed';
}

/**
 * Prompt 31 Part 4/34 — the MANDATORY, fail-CLOSED twin of
 * `checkPincodeServiceability` above. Deliberately the opposite posture:
 * that function is a best-effort ETA widget where "can't tell" safely means
 * "assume yes, fall back to zones"; THIS function backs a checkout gate a
 * super admin explicitly opted into (`address_verification.
 * serviceabilityCheckEnabled` — see address-verification-config.service.ts)
 * , so "can't tell" here must mean "block checkout," never "assume yes."
 * Reuses the exact same `checkServiceability`/`isShiprocketConfigured`/
 * warehouse-resolution building blocks as the best-effort function — this is
 * NOT a second integration, only a second decision about what an
 * inconclusive answer means. Never modifies, and is never called by,
 * `checkPincodeServiceability`.
 */
export async function checkServiceabilityForCheckout(params: {
  pincode: string;
  sellerId: string | null;
  totalWeightGrams?: number;
}): Promise<CheckoutServiceabilityResult> {
  if (!(await isShiprocketConfigured())) {
    logger.error(
      { integration: 'shiprocket', operation: 'check_serviceability' },
      'Mandatory Shiprocket serviceability check is enabled but Shiprocket is not configured — failing closed',
    );
    return { serviceable: false, reason: 'not_configured' };
  }

  const warehouse = params.sellerId
    ? await WarehouseModel.findOne({ sellerId: params.sellerId, deletedAt: null }).lean()
    : null;
  const pickupPincode = warehouse?.pincode;
  if (!pickupPincode) {
    logger.warn(
      { sellerId: params.sellerId, integration: 'shiprocket', operation: 'check_serviceability' },
      'No pickup warehouse resolvable for mandatory serviceability check — failing closed',
    );
    return { serviceable: false, reason: 'no_warehouse' };
  }

  try {
    const result = await checkServiceability({
      pickupPincode,
      deliveryPincode: params.pincode,
      weightKg: Math.max((params.totalWeightGrams ?? 500) / 1000, 0.01),
      cod: false,
    });

    const couriers = result.data?.available_courier_companies ?? [];
    if (couriers.length === 0) return { serviceable: false, reason: 'no_couriers' };
    return { serviceable: true };
  } catch (err) {
    // `err` (not `error`) is deliberate — pino's default serializers only
    // auto-expand an Error's message/stack for a property literally named
    // `err`; logging it as `error` silently produced `{}` in the log output,
    // making this exact failure path unnecessarily hard to diagnose.
    //
    // Bugfix (Human-Readable API Logging) Part 8/15/20 — an authentication
    // failure is an EXTERNAL SERVICE ERROR (our credentials are rejected —
    // an admin needs to act), logged at ERROR with a precise cause; any
    // other failure (network/timeout/5xx) stays WARN, since it's more likely
    // transient. Both still fail closed and block checkout identically —
    // this only changes what a developer sees in the log, never the
    // customer-facing behavior.
    if (isShiprocketAuthFailure(err)) {
      logger.error(
        {
          err,
          pincode: params.pincode,
          cause: 'External Shiprocket authentication failed',
          integration: 'shiprocket',
          operation: 'check_serviceability',
        },
        'Mandatory Shiprocket serviceability check failed — authentication rejected, failing closed',
      );
      return { serviceable: false, reason: 'authentication_failed' };
    }
    logger.warn(
      { err, pincode: params.pincode, integration: 'shiprocket', operation: 'check_serviceability' },
      'Mandatory Shiprocket serviceability check failed — failing closed, blocking checkout',
    );
    return { serviceable: false, reason: 'api_unreachable' };
  }
}

// --- Webhook processing (Part 22/23/24) ---

interface ShiprocketWebhookPayload {
  awb?: string;
  awb_code?: string;
  current_status?: string;
  shipment_status?: string;
  order_id?: string | number;
  current_status_id?: number;
  scan_date_time?: string;
}

function dedupKeyFor(payload: ShiprocketWebhookPayload): string {
  const awb = payload.awb || payload.awb_code || '';
  const status = payload.current_status || payload.shipment_status || '';
  const at = payload.scan_date_time || '';
  return `${awb}|${status}|${at}`;
}

/**
 * Processes an inbound Shiprocket webhook delivery. Idempotent (Part 22): a
 * duplicate delivery of the exact same event is detected via the dedup log
 * (unique index) and skipped without reapplying. Maps Shiprocket's status
 * vocabulary onto the existing internal SHIPMENT_STATUS enum through
 * SHIPROCKET_STATUS_MAP (Part 23) rather than inventing new statuses;
 * unmapped/unrecognized statuses are logged and stored as
 * `shiprocketStatusRaw` only, without forcing an invalid internal transition.
 */
export async function processShiprocketWebhookEvent(payload: ShiprocketWebhookPayload): Promise<void> {
  const dedupKey = dedupKeyFor(payload);
  const awbCode = payload.awb || payload.awb_code || '';
  const statusRaw = payload.current_status || payload.shipment_status || '';

  try {
    await ShiprocketWebhookLogModel.create({
      dedupKey,
      awbCode,
      shiprocketOrderId: payload.order_id ? String(payload.order_id) : '',
      statusRaw,
    });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      logger.info({ dedupKey }, 'Duplicate Shiprocket webhook delivery ignored');
      return;
    }
    throw error;
  }

  if (!awbCode) return;
  const shipment = await ShipmentModel.findOne({ awbCode });
  if (!shipment) {
    logger.warn({ awbCode }, 'Shiprocket webhook for unknown AWB — no matching shipment');
    return;
  }

  shipment.shiprocketStatusRaw = statusRaw;
  await shipment.save();

  const mappedStatus = SHIPROCKET_STATUS_MAP[statusRaw.toLowerCase().trim()] as ShipmentStatus | undefined;
  if (!mappedStatus) {
    logger.warn({ statusRaw }, 'Unmapped Shiprocket status — stored raw only, no internal transition applied');
    await recordAudit({
      actorId: null,
      actorType: ACTOR_TYPES.WEBHOOK,
      action: SHIPMENT_AUDIT_ACTIONS.SYSTEM_PROCESSED_SHIPMENT_WEBHOOK,
      resource: 'shipment',
      resourceId: String(shipment._id),
      metadata: { statusRaw, mapped: false },
    });
    return;
  }

  if (mappedStatus !== shipment.status) {
    // `null` actor: reuses updateShipmentStatus's full transition path
    // (tracking timeline + order-status sync + notification), attributed to
    // WEBHOOK, not the last human admin who touched this order (Part 27/30).
    await updateShipmentStatus(String(shipment._id), mappedStatus, null, {
      remarks: `Shiprocket webhook: ${statusRaw}`,
    }).catch((err) => {
      logger.warn({ err, shipmentId: String(shipment._id) }, 'Webhook-driven shipment status update failed');
    });
  }

  await recordAudit({
    actorId: null,
    actorType: ACTOR_TYPES.WEBHOOK,
    action: SHIPMENT_AUDIT_ACTIONS.SYSTEM_PROCESSED_SHIPMENT_WEBHOOK,
    resource: 'shipment',
    resourceId: String(shipment._id),
    metadata: { statusRaw, mapped: true, mappedStatus },
  });
}
