import { DOCUMENT_STATUS, SHIPMENT_STATUS, STORAGE_PROVIDERS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/** Separate from Order — supports partial fulfillment (multiple shipments per order). Tracking events embedded (bounded, always read with the shipment). */
const shipmentSchema = new Schema({
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  deliveryPartnerId: { type: Schema.Types.ObjectId, ref: 'DeliveryPartner', default: null },
  trackingNumber: { type: String, default: '' },
  status: {
    type: String,
    enum: Object.values(SHIPMENT_STATUS),
    default: SHIPMENT_STATUS.PENDING,
    index: true,
  },
  itemIds: { type: [Schema.Types.ObjectId], default: [] }, // subset of Order.items being shipped
  estimatedDeliveryDate: { type: Date, default: null },
  // dispatchedAt/shippedAt represent the same physical event (order left the warehouse) —
  // both are set together the first time the shipment moves past READY_FOR_DISPATCH.
  dispatchedAt: { type: Date, default: null },
  shippedAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  deliveryNotes: { type: String, default: '' },
  trackingEvents: {
    type: [
      {
        status: { type: String, required: true },
        location: { type: String, default: '' },
        remarks: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },

  // ---  14: Shiprocket / fulfillment integration ---
  // Denormalized from Order at shipment-creation time (Part 5) so shipment
  // queries/filters don't need to join back to Order for every list/search;
  // also lets ownership be validated (warehouse.sellerId === order.sellerId)
  // once, up front, rather than re-derived on every read.
  sellerId: { type: Schema.Types.ObjectId, ref: 'Seller', default: null, index: true },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null, index: true },
  invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },

  // External Shiprocket identifiers (Part 15/16) — plain reference columns
  // per docs/DEVELOPMENT_TASKS.md SHIP-01, no generic external-ID mapping
  // table. `shiprocketOrderId` carries the idempotency guarantee (Part 15):
  // before creating a new Shiprocket order for an Order, callers check
  // whether a Shipment already has one and reuse it instead.
  shiprocketOrderId: { type: String, default: null },
  shiprocketShipmentId: { type: String, default: null },
  courierId: { type: String, default: '' },
  courierName: { type: String, default: '' },
  awbCode: { type: String, default: '' },
  // Own persistent copy of the label (re-uploaded through the centralized
  // storage abstraction — storage.service.ts / document-storage.helper.ts,
  // S3 when configured, Cloudinary fallback otherwise), never Shiprocket's
  // externally-hosted URL directly and never raw PDF bytes in Mongo (Part 19).
  // For `storageProvider: 's3'` shipments, this holds the private S3 object
  // key, not a working URL — see shipment.controller.ts's downloadLabelHandler.
  labelUrl: { type: String, default: '' },
  storageProvider: { type: String, enum: Object.values(STORAGE_PROVIDERS), default: STORAGE_PROVIDERS.CLOUDINARY },
  documentStatus: { type: String, enum: Object.values(DOCUMENT_STATUS), default: DOCUMENT_STATUS.GENERATING },
  // Raw Shiprocket status string, kept purely for admin/debugging visibility
  // alongside the mapped `status` field above (Part 23's "clear mapping
  // layer" lives in code — SHIPROCKET_STATUS_MAP — not as a second enum here).
  shiprocketStatusRaw: { type: String, default: '' },

  // Weight/dimensions actually sent to Shiprocket, snapshotted from the
  // order's products at shipment-creation time (Part 6/7) — not re-derived
  // from current product data on every read.
  weightGrams: { type: Number, default: null },
  dimensions: {
    lengthMm: { type: Number, default: null },
    widthMm: { type: Number, default: null },
    heightMm: { type: Number, default: null },
  },
  // Part 8 — surfaced, never silently dropped; ordinary courier shipment
  // still proceeds (no cold-chain courier network exists in this build) but
  // admin/future logic can filter/warn on it.
  coldStorageRequired: { type: Boolean, default: false },

  // Safe, admin-only operational error detail (Part 31) — never the raw
  // Shiprocket response body, never credentials; set on failed
  // create/AWB-assign/label attempts, cleared on the next successful one.
  lastError: { type: String, default: '' },
  pickupScheduledAt: { type: Date, default: null },
});

shipmentSchema.index({ trackingNumber: 1 });
shipmentSchema.index({ sellerId: 1, createdAt: -1 });
shipmentSchema.index({ awbCode: 1 });
// Live-verification fix — `{unique:true, sparse:true}` does NOT
// exclude this field the way it looks like it should: `default: null` makes
// `shiprocketOrderId` always PRESENT (with value null) on every document
// Mongoose creates, and "sparse" only excludes genuinely ABSENT fields, not
// present-but-null ones. The result: only the FIRST manual/non-Shiprocket
// shipment in the whole collection could ever be created; every one after
// it hit `E11000 duplicate key error ... shiprocketOrderId: null`. This is
// the exact same bug already found and fixed for
// NotificationQueueModel.idempotencyKey in — same fix here:
// a partial index that only applies once the field actually holds a string.
shipmentSchema.index(
  { shiprocketOrderId: 1 },
  { unique: true, partialFilterExpression: { shiprocketOrderId: { $type: 'string' } } },
);

auditPlugin(shipmentSchema);

export type ShipmentDocument = InferSchemaType<typeof shipmentSchema>;
export const ShipmentModel = model('Shipment', shipmentSchema);
