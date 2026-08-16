import { DOCUMENT_STATUS, INVOICE_STATUS, STORAGE_PROVIDERS } from '@medcommerce/shared';
import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * Line items — and, as of Prompt 13, the full tax/legal snapshot fields
 * below — are a legal point-in-time snapshot (not references) — an invoice
 * must not change if the underlying Order/Product/Seller/Warehouse data is
 * edited later. All tax-snapshot fields here are computed EXACTLY ONCE, at
 * first invoice generation (see invoice.service.ts / tax-calculation.service.ts),
 * and never recalculated on regeneration — a "regenerate" re-renders the PDF
 * from these already-frozen values, it does not call the tax engine again
 * (Part 15: invoice immutability). `regenerations` tracks reprints so
 * historical PDFs stay traceable to the template version active when each
 * was generated (Prompt 1's PDF strategy).
 */
const invoiceSchema = new Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  // `unique: true` (new in Prompt 13) is the concurrency guarantee Part 11/23
  // require: two concurrent generateInvoiceForOrder(orderId) calls can now
  // never both succeed in creating a document for the same order — the
  // second hits a duplicate-key error, which invoice.service.ts catches and
  // treats as "someone else already created it, fetch and use that one."
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  // Copied from order.sellerId at invoice-generation time (see
  // invoice.service.ts) and never re-derived afterward — Part 9: "Invoice
  // history must remain correct even if Seller configuration changes." This
  // is also the field seller-scoped invoice numbering (Part 14) keys off of.
  sellerId: { type: Schema.Types.ObjectId, ref: 'Seller', default: null, index: true },

  // ---- Prompt 13 — frozen seller/warehouse/jurisdiction snapshot (Part 9) ----
  sellerNameSnapshot: { type: String, default: '' },
  sellerGstinSnapshot: { type: String, default: '' },
  sellerAddressSnapshot: { type: String, default: '' },
  sellerDrugLicenseSnapshot: { type: String, default: '' },
  warehouseId: { type: Schema.Types.ObjectId, ref: 'Warehouse', default: null },
  warehouseNameSnapshot: { type: String, default: '' },
  warehouseGstinSnapshot: { type: String, default: '' },
  warehouseStateCodeSnapshot: { type: String, default: '' },
  customerShippingStateSnapshot: { type: String, default: '' },
  // 'intra_state' -> CGST+SGST charged; 'inter_state'/'unknown' -> IGST
  // charged (see packages/shared/src/utils/tax.ts's resolveGstTaxType/splitGst
  // for why 'unknown' defaults to the IGST branch rather than guessing).
  taxType: { type: String, enum: ['intra_state', 'inter_state', 'unknown'], default: 'unknown' },

  items: {
    type: [
      {
        name: { type: String, required: true },
        batchNumber: { type: String, default: '' },
        // Immutable historical reference to the actual batch sold (Part 19)
        // — never re-resolved from Product/current-inventory after creation.
        batchId: { type: Schema.Types.ObjectId, ref: 'Batch', default: null },
        hsnCode: { type: String, default: '' },
        // Effective MRP at time of sale — batch.mrp override if present,
        // else Product.mrp (Part 5). Distinct from `unitPrice` (the actual
        // selling price), which the existing Pricing/Discount engine owns.
        mrp: { type: Number, default: null },
        quantity: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
        gstRate: { type: Number, required: true },
        amount: { type: Number, required: true },
        // Prompt 13 per-line tax breakdown (Part 9). Zero-valued (not
        // omitted) for a bundle line — see `bundleComponents` below for the
        // real per-HSN mixed-GST breakdown on those lines (Part 7).
        taxableAmount: { type: Number, default: 0 },
        cgstRate: { type: Number, default: 0 },
        cgstAmount: { type: Number, default: 0 },
        sgstRate: { type: Number, default: 0 },
        sgstAmount: { type: Number, default: 0 },
        igstRate: { type: Number, default: 0 },
        igstAmount: { type: Number, default: 0 },
        // Prompt 30 — this line's frozen product-level shipping
        // contribution, copied verbatim from `order.items[].shippingAmount`
        // at first invoice generation and never recomputed on regeneration
        // (Part 15/16/17 immutability — same rule as every other tax field
        // on this line).
        shippingAmount: { type: Number, default: 0 },
        // Present ONLY for bundle lines (mirrors order.model.ts's item
        // shape) — each component's own apportioned taxable value + GST
        // split, since a bundle can mix HSNs/GST rates (Part 6/7).
        bundleComponents: {
          type: [
            {
              productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
              name: { type: String, required: true },
              sku: { type: String, required: true },
              quantity: { type: Number, required: true },
              unitPriceShare: { type: Number, required: true },
              gstRate: { type: Number, required: true },
              hsnCode: { type: String, default: '' },
              taxableAmount: { type: Number, required: true },
              cgstRate: { type: Number, default: 0 },
              cgstAmount: { type: Number, default: 0 },
              sgstRate: { type: Number, default: 0 },
              sgstAmount: { type: Number, default: 0 },
              igstRate: { type: Number, default: 0 },
              igstAmount: { type: Number, default: 0 },
            },
          ],
          default: undefined,
        },
      },
    ],
    default: [],
  },

  gstBreakup: {
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
  },

  totals: {
    subtotal: { type: Number, required: true },
    gst: { type: Number, required: true },
    shipping: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
  },

  // ---- Prompt 13 (TAX-02) — invoice round-off ----
  // Computed once at final invoice assembly as
  // `finalAmount - shipping + discount - sum(taxableAmount + gst per line)`
  // (see tax-calculation.service.ts) — never re-derived afterward. Can be
  // positive or negative; typically a few paise of per-line-rounding drift.
  roundOffAmount: { type: Number, default: 0 },
  // Alias of `totals.grandTotal`, kept as its own top-level field to match
  // Prompt 13's explicit field-naming (Part 24) — always exactly equal to
  // `totals.grandTotal`/what the customer was actually charged, the
  // round-off never alters this value.
  finalAmount: { type: Number, default: 0 },
  // Distinct from `createdAt` (a generic Mongoose timestamp) — the legal
  // invoice date, set once at generation and never touched by a later
  // regeneration (Part 15: invoice date is an immutable legal field).
  invoiceDate: { type: Date, default: null },

  couponCode: { type: String, default: null },
  razorpayPaymentId: { type: String, default: null },
  status: { type: String, enum: Object.values(INVOICE_STATUS), default: INVOICE_STATUS.DRAFT },
  // Prompt 15 — for `storageProvider: 's3'` invoices, `pdfUrl` holds the S3
  // OBJECT KEY (not a working URL); the bucket is private, so a real
  // downloadable link is only ever generated on demand via a short-lived
  // presigned URL (see invoice.service.ts's resolveInvoiceDownloadUrl).
  // Legacy rows created before this prompt have `storageProvider: 'cloudinary'`
  // and `pdfUrl` remains their already-public, directly-usable Cloudinary URL
  // — untouched, no migration/rewrite performed on them (Part 31).
  pdfUrl: { type: String, default: null },
  storageProvider: { type: String, enum: Object.values(STORAGE_PROVIDERS), default: STORAGE_PROVIDERS.CLOUDINARY },
  documentStatus: { type: String, enum: Object.values(DOCUMENT_STATUS), default: DOCUMENT_STATUS.GENERATING },

  regenerations: {
    type: [
      {
        version: { type: Number, required: true },
        pdfUrl: { type: String, required: true },
        generatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        generatedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
});

invoiceSchema.index({ customerId: 1, createdAt: -1 });
invoiceSchema.index({ sellerId: 1, createdAt: -1 });
invoiceSchema.index({ invoiceDate: -1 });

auditPlugin(invoiceSchema);

export type InvoiceDocument = InferSchemaType<typeof invoiceSchema>;
export const InvoiceModel = model('Invoice', invoiceSchema);
