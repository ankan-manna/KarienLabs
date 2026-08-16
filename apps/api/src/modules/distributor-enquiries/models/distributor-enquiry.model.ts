import { DISTRIBUTOR_ENQUIRY_STATUS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Prompt 32 — a business ENQUIRY/LEAD, deliberately its own domain: never
 * references Order/Payment/Shipment/Invoice, and nothing in this module
 * writes to Product/Batch/Inventory. See distributor-enquiry.service.ts's
 * doc comment for the full list of what submitting one must NOT do.
 *
 * `requestedProducts` stores a frozen SNAPSHOT (name/sku/quantity) alongside
 * an optional live reference (`productId`/`bundleId`) — Part 6/65: the
 * catalog can rename/reprice/deactivate the product later and this enquiry
 * must still read back exactly what was asked for at submission time. The
 * live reference is kept ONLY for admin convenience (e.g. "open this
 * product"), never re-read to "correct" the snapshot.
 */
const requestedProductSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    bundleId: { type: Schema.Types.ObjectId, ref: 'Bundle', default: null },
    // Frozen at submission time — never re-derived from the live Product/Bundle.
    nameSnapshot: { type: String, required: true },
    skuSnapshot: { type: String, required: true },
    requestedQuantity: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const internalNoteSchema = new Schema(
  {
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    note: { type: String, required: true, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const distributorEnquirySchema = new Schema({
  enquiryNumber: { type: String, required: true, unique: true }, // e.g. DBE-2026-000123 (generateSequenceNumber)

  // Prompt 32 Part 9 — set ONLY from the authenticated session (never trusts
  // a client-submitted userId); null for a guest submission.
  userId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

  companyName: { type: String, required: true, trim: true, maxlength: 200 },
  contactPerson: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, trim: true, lowercase: true, index: true },
  mobile: { type: String, required: true, trim: true, index: true },

  gstin: { type: String, default: null, trim: true, uppercase: true },
  businessAddress: { type: String, required: true, trim: true, maxlength: 500 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  state: { type: String, required: true, trim: true, maxlength: 100 },
  pincode: { type: String, required: true, trim: true },
  // Free-text requirement description — never rendered as raw HTML (Part 31;
  // see distributor-enquiry.validator.ts's sanitization + the admin
  // frontend's plain-text rendering).
  message: { type: String, default: '', trim: true, maxlength: 4000 },

  requestedProducts: { type: [requestedProductSchema], default: [] },

  // Prompt 32 Part 10/11 — whether the submitted email was OTP-verified
  // before this enquiry was created. Always `false` when
  // `distributor_enquiry.otpRequired` was off at submission time (never
  // retroactively implied true).
  contactVerified: { type: Boolean, default: false },

  status: {
    type: String,
    enum: Object.values(DISTRIBUTOR_ENQUIRY_STATUS),
    default: DISTRIBUTOR_ENQUIRY_STATUS.NEW,
    index: true,
  },
  assignedAdminId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  // Private, admin-only (Part 23/58) — distributor-enquiry.controller.ts's
  // public/customer-facing responses never select this field.
  internalNotes: { type: [internalNoteSchema], default: [] },

  contactedAt: { type: Date, default: null },
  resolvedAt: { type: Date, default: null },
});

distributorEnquirySchema.index({ createdAt: -1 });
distributorEnquirySchema.index({ 'requestedProducts.productId': 1 });

auditPlugin(distributorEnquirySchema);

export type DistributorEnquiryDocument = InferSchemaType<typeof distributorEnquirySchema>;
export const DistributorEnquiryModel = model('DistributorEnquiry', distributorEnquirySchema);
