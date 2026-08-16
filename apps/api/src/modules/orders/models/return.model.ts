import {
  DOCUMENT_STATUS,
  QC_RESULT,
  RETURN_RESOLUTION_TYPE,
  RETURN_STATUS,
  STORAGE_PROVIDERS,
} from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Prompt 16 — extends the pre-existing Return model (do not remove
 * orderId/customerId/items/status/approvedBy/refundId — real data and code
 * from before this prompt depends on them) with the inspection/reverse-
 * logistics/replacement fields the extended state machine needs. Reasons
 * are captured per-item (Part 3), amounts/HSN/GST are NEVER recomputed here
 * — refund uses the ORIGINAL order item's frozen unitPrice/gstRate via
 * return-refund-calculation.util.ts, exactly like the invoice engine
 * freezes tax data once (Prompt 13's immutability pattern applied here too).
 */
const returnSchema = new Schema({
  // Human-readable, seller-scoped-ready identifier (Part 42/43) — sequence
  // via the existing generateSequenceNumber utility (see return.service.ts),
  // same mechanism Order/Invoice numbering already use. `default: null` so
  // pre-Prompt-16 Return documents (numberless) remain valid/readable.
  returnNumber: { type: String, default: null, unique: true, sparse: true },

  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Denormalized from Order at request time (Part 36/42) — lets seller-scoped
  // admin queries/filters avoid a join on every list/detail read, same
  // reasoning as Shipment.sellerId (Prompt 14).
  sellerId: { type: Schema.Types.ObjectId, ref: 'Seller', default: null, index: true },
  // Resolved once the return is approved (the warehouse that will receive
  // the reverse shipment / perform inspection) — Part 37.
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null, index: true },

  items: {
    type: [
      {
        orderItemId: { type: Schema.Types.ObjectId, required: true },
        quantity: { type: Number, required: true, min: 1 },
        reason: { type: String, required: true },
        description: { type: String, default: '' },
        // Evidence (Part 3) — photos/documents the customer attaches,
        // uploaded through the SAME StorageService/S3 pipeline as every
        // other document in this project (Part 33/46), never Cloudinary.
        evidenceUrls: { type: [String], default: [] },
        requestedResolution: {
          type: String,
          enum: Object.values(RETURN_RESOLUTION_TYPE),
          default: RETURN_RESOLUTION_TYPE.REFUND,
        },
        // Point-in-time snapshot of the order item at request time (Part 3:
        // "use references plus immutable snapshots where historical display
        // requires it") — display/refund calc never re-reads the live Order
        // item after this, so a later (impossible, but defensive) order edit
        // can't retroactively change what a return says it was for.
        productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
        name: { type: String, default: '' },
        sku: { type: String, default: '' },
        unitPrice: { type: Number, default: 0 },
        gstRate: { type: Number, default: 0 },
        // The ACTUAL batch this order item's quantity was sold from (Part 17)
        // — resolved from the original SALE StockMovement(s) at inspection
        // time, never guessed/re-selected. A single order-item quantity can
        // in principle span >1 batch; `batchId` holds the first/primary one
        // for display, the authoritative per-batch restock trail lives in
        // StockMovement (referenceType: 'return').
        batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
        qcResult: { type: String, enum: [...Object.values(QC_RESULT), null], default: null },
        restocked: { type: Boolean, default: false },
        inspectionNotes: { type: String, default: '' },
      },
    ],
    default: [],
  },

  status: {
    type: String,
    enum: Object.values(RETURN_STATUS),
    default: RETURN_STATUS.REQUESTED,
    index: true,
  },
  rejectionReason: { type: String, default: '' }, // promoted from the pre-16 untyped `.set()` write to a real field.
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

  receivedAt: { type: Date, default: null },
  receivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  inspectedAt: { type: Date, default: null },
  inspectedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

  resolutionType: { type: String, enum: [...Object.values(RETURN_RESOLUTION_TYPE), null], default: null },
  refundId: { type: Schema.Types.ObjectId, ref: 'Refund', default: null },
  // Part 26/28 — replacement is a SEPARATE linked order, never a mutation of
  // the original order's items.
  replacementOrderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },

  // Part 11/12 — deliberately its OWN sub-object, never written onto the
  // forward Shipment document. Same field shape as Shipment's Shiprocket
  // fields (Prompt 14) for consistency, but a fully separate AWB/tracking
  // history — see return-shiprocket.service.ts.
  reverseShipment: {
    shiprocketOrderId: { type: String, default: null },
    shiprocketShipmentId: { type: String, default: null },
    awbCode: { type: String, default: '' },
    courierId: { type: String, default: '' },
    courierName: { type: String, default: '' },
    status: { type: String, default: '' },
    shiprocketStatusRaw: { type: String, default: '' },
    labelUrl: { type: String, default: '' },
    storageProvider: { type: String, enum: Object.values(STORAGE_PROVIDERS), default: STORAGE_PROVIDERS.CLOUDINARY },
    documentStatus: { type: String, enum: Object.values(DOCUMENT_STATUS), default: DOCUMENT_STATUS.GENERATING },
    lastError: { type: String, default: '' },
    pickupScheduledAt: { type: Date, default: null },
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
  },
});

returnSchema.index({ sellerId: 1, createdAt: -1 });
returnSchema.index({ status: 1, createdAt: -1 });
returnSchema.index({ 'reverseShipment.awbCode': 1 });

auditPlugin(returnSchema);

export type ReturnDocument = InferSchemaType<typeof returnSchema>;
export const ReturnModel = model('Return', returnSchema);
