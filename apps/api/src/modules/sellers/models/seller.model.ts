import { Schema, model, type InferSchemaType } from 'mongoose';

import { auditPlugin } from '../../../plugins/audit.plugin';

/**
 * A Seller is a legal/business entity that sells on the platform — distinct
 * from Supplier (who the platform buys inventory FROM, see
 * inventory/models/supplier.model.ts) and distinct from a platform Admin
 * (who operates the platform but isn't a party to the sale). The client
 * requires ~2-3 sellers (docs/DEVELOPMENT_TASKS.md CAT-01).
 *
 * `enabled` (not a separate ENABLED/DISABLED string enum) is deliberately
 * the exact boolean field CAT-01 specifies — true == ENABLED, false ==
 * DISABLED. Sellers are never hard-deleted (auditPlugin's soft-delete only)
 * since Orders/Invoices/Payments/Returns/Reports/Audit records can reference
 * a seller indefinitely; `enabled: false` is how a seller stops taking new
 * business without breaking that history.
 */
const sellerSchema = new Schema({
  legalName: { type: String, required: true, trim: true },
  // Uppercase + trimmed at the schema level too (not just the Zod validator)
  // so direct writes (migration script, future imports) stay consistent.
  gstin: { type: String, required: true, trim: true, uppercase: true },
  drugLicenseNumber: { type: String, required: true, trim: true },
  enabled: { type: Boolean, default: true },
  // legal/registered address, shown on invoices (Part 13:
  // "Seller Address"). Optional since it didn't exist before this update;
  // pre-existing sellers simply show a blank address until an admin fills it in.
  address: { type: String, default: '' },
  // (Part 14) — short code used to build this seller's invoice
  // prefix (e.g. "A" -> INV-A-2026-000001). Optional: falls back to a
  // deterministic derivation from `legalName` when unset (see
  // invoice.service.ts's resolveSellerInvoiceCode) so numbering works
  // without requiring every admin to configure this immediately.
  invoiceCode: { type: String, default: null, trim: true, uppercase: true, maxlength: 8 },
});

// GSTIN must be unique per seller (excluding soft-deleted records) — the same
// partial-unique-index pattern used by Product.slug/sku and Warehouse.code.
sellerSchema.index({ gstin: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } });
sellerSchema.index({ enabled: 1 });

auditPlugin(sellerSchema);

export type SellerDocument = InferSchemaType<typeof sellerSchema>;
export const SellerModel = model('Seller', sellerSchema);
