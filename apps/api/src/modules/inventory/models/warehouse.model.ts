import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

const WAREHOUSE_STATUSES = ['operational', 'maintenance', 'closed'] as const;

const warehouseSchema = new Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  pincode: { type: String, default: '' },
  isActive: { type: Boolean, default: true },
  managerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  capacity: { type: Number, default: null },
  location: {
    type: {
      lat: { type: Number },
      lng: { type: Number },
    },
    default: null,
  },
  status: { type: String, enum: WAREHOUSE_STATUSES, default: 'operational' },

  // Seller/Warehouse relationship (CAT-01/CAT-02). `default: null`
  // (not `required: true`) at the schema level so pre-existing warehouses
  // created before this  don't fail Mongoose validation on unrelated
  // partial updates; `sellerId` IS required by the Zod validator on new
  // warehouse creation (see warehouse.validator.ts) and backfilled for
  // existing rows by scripts/migrate-seller-backfill.ts. Ownership changes
  // after creation go through the dedicated transfer flow in
  // warehouse.service.ts, not a plain PATCH — see `transferWarehouseSeller`.
  sellerId: { type: Schema.Types.ObjectId, ref: 'Seller', default: null, index: true },
  // GSTIN/stateCode of THIS warehouse's registered tax entity — distinct from
  // `state` above (a plain address field). stateCode is specifically the
  // 2-digit GST state code the later GST engine (TAX-01) compares against
  // the customer's shipping-address state to decide CGST+SGST vs IGST.
  gstin: { type: String, default: '', trim: true, uppercase: true },
  stateCode: { type: String, default: '', trim: true },

  // Shiprocket pickup-location registration requires a contact
  // phone/email for the warehouse (their "add pickup location" API schema).
  // Optional/defaulted so existing warehouses remain valid without a backfill;
  // shipment creation surfaces a clear error if these are missing on the
  // warehouse actually being used as shipment origin (see
  // shiprocket-fulfillment.service.ts).
  contactPhone: { type: String, default: '', trim: true },
  contactEmail: { type: String, default: '', trim: true, lowercase: true },
});

warehouseSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
warehouseSchema.index({ stateCode: 1 });

auditPlugin(warehouseSchema);

export type WarehouseDocument = InferSchemaType<typeof warehouseSchema>;
export const WarehouseModel = model('Warehouse', warehouseSchema);
