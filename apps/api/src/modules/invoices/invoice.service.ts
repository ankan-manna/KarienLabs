import {
  ACTOR_TYPES,
  DOCUMENT_STATUS,
  DOCUMENT_TYPES,
  FULFILLMENT_AUDIT_ACTIONS,
  INVOICE_AUDIT_ACTIONS,
  INVOICE_STATUS,
  STORAGE_PROVIDERS,
  type Role,
} from '@medcommerce/shared';
import type { HydratedDocument } from 'mongoose';

import { env } from '../../config/env';
import { renderPdf } from '../../integrations/pdf/pdf.service';
import { s3Ops } from '../../integrations/s3/s3-ops';
import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import { generateSequenceNumber } from '../../utils/sequence.util';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { UserModel } from '../auth/models/user.model';
import {
  resolveDocumentDownloadUrl,
  uploadAndRecordDocument,
} from '../documents/document-storage.helper';
import { enqueueNotification } from '../notifications/notification.service';
import { OrderModel, type OrderDocument } from '../orders/models/order.model';
import { PaymentModel } from '../payments/models/payment.model';
import { getConfiguration } from '../platform/configuration.service';
import { SellerModel } from '../sellers/models/seller.model';
import { calculateOrderTax, type InvoiceLineTax, type OrderTaxSnapshot } from '../tax/tax-calculation.service';

import { InvoiceModel, type InvoiceDocument } from './models/invoice.model';

/** Presigned expiry used specifically for the async/email delivery context — longer than the ~5-minute default used for interactive downloads (getInvoiceDownloadUrl) since an email may not be opened immediately, still far short of a permanent public link. */
const EMAIL_LINK_TTL_SECONDS = 24 * 60 * 60;

/** Reads the "Invoice Prefix" from Business Configuration (`invoicePrefix`), falling back to the default 'INV' when unset — unchanged from before  13, just now combined with a per-seller code (see resolveSellerInvoiceCode). */
async function getInvoiceNumberPrefix(): Promise<string> {
  const config = await getConfiguration('business');
  const prefix = (config as { invoicePrefix?: unknown }).invoicePrefix;
  return typeof prefix === 'string' && prefix.trim() ? prefix.trim() : 'INV';
}

/** `seller.invoiceCode` if the admin set one, else a deterministic 3-letter code derived from the legal name (e.g. "Acme Pharma Pvt Ltd" -> "ACM") — never blank, so seller-scoped numbering always has *some* stable prefix component without requiring extra admin setup. */
function resolveSellerInvoiceCode(seller: { invoiceCode?: string | null; legalName?: string } | null): string {
  if (seller?.invoiceCode) return seller.invoiceCode;
  const letters = (seller?.legalName ?? '').replace(/[^A-Za-z]/g, '').toUpperCase();
  return letters.slice(0, 3) || 'GEN';
}

/**
 * Part 14 — seller-scoped invoice numbering. Each seller gets its
 * own atomic counter (`generateSequenceNumber`'s `scope` param, added in
 * for exactly this) so e.g. Seller A and Seller B both issuing
 * their first invoice on the same day both correctly get "...-000001"
 * instead of competing for one global sequence. Orders with no resolvable
 * seller (pre--11 legacy data, or genuinely ambiguous multi-seller
 * checkout — see order.service.ts's resolveCheckoutSeller) fall back to the
 * original single global counter, unchanged.
 */
async function nextInvoiceNumber(sellerId: string | null): Promise<string> {
  const basePrefix = await getInvoiceNumberPrefix();
  if (!sellerId) return generateSequenceNumber('invoice', basePrefix);

  const seller = await SellerModel.findById(sellerId).select('invoiceCode legalName').lean();
  const code = resolveSellerInvoiceCode(seller);
  return generateSequenceNumber('invoice', `${basePrefix}-${code}`, sellerId);
}

/** Shape common to a freshly-computed OrderTaxSnapshot and an already-stored InvoiceDocument — lets the PDF renderer work identically whether it's rendering brand-new tax data or just re-rendering an already-frozen invoice (Part 15 immutability: regeneration never recomputes tax, only re-renders). */
interface InvoicePdfData {
  sellerNameSnapshot: string;
  sellerGstinSnapshot: string;
  sellerAddressSnapshot: string;
  sellerDrugLicenseSnapshot: string;
  warehouseNameSnapshot: string;
  warehouseGstinSnapshot: string;
  warehouseStateCodeSnapshot: string;
  customerShippingStateSnapshot: string;
  items: InvoiceLineTax[];
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstAmount: number;
  roundOffAmount: number;
  finalAmount: number;
}

async function renderInvoicePdfBuffer(
  order: HydratedDocument<OrderDocument>,
  invoiceNumber: string,
  invoiceDate: Date,
  data: InvoicePdfData,
): Promise<Buffer> {
  const { shippingAddress, totals } = order;
  if (!totals || !shippingAddress) throw new UnprocessableEntityError('Order is missing billing data');

  const payment = order.paymentId
    ? await PaymentModel.findById(order.paymentId).select('method razorpayPaymentId').lean()
    : null;

  const billedAddress = {
    name: shippingAddress.name,
    address: `${shippingAddress.line1}, ${shippingAddress.city}, ${shippingAddress.state} ${shippingAddress.pincode}`,
    phone: shippingAddress.phone,
  };

  return renderPdf('invoice', {
    store: {
      name: data.sellerNameSnapshot || 'KarienLabs',
      address: data.sellerAddressSnapshot,
      gstin: data.sellerGstinSnapshot,
      drugLicense: data.sellerDrugLicenseSnapshot,
      // Part 38 — the project logo, served as a plain static
      // asset by the web app (apps/web/public/logo.jpg), never a
      // filesystem path baked into this (API-side) application code.
      logoUrl: `${env.WEB_BASE_URL}/logo.jpg`,
    },
    warehouse: {
      name: data.warehouseNameSnapshot,
      gstin: data.warehouseGstinSnapshot,
      stateCode: data.warehouseStateCodeSnapshot,
    },
    invoice: { number: invoiceNumber, date: invoiceDate.toLocaleDateString('en-IN') },
    order: { number: order.orderNumber },
    customer: {
      name: billedAddress.name,
      address: billedAddress.address,
      email: '',
      phone: billedAddress.phone,
      shippingState: data.customerShippingStateSnapshot,
    },
    billingAddress: { distinct: false, ...billedAddress },
    items: data.items,
    taxSummary: {
      taxableAmount: data.taxableAmount,
      cgstAmount: data.cgstAmount,
      sgstAmount: data.sgstAmount,
      igstAmount: data.igstAmount,
      gstAmount: data.gstAmount,
    },
    totals,
    roundOffAmount: data.roundOffAmount,
    finalAmount: data.finalAmount,
    payment: payment ? { method: payment.method, razorpayPaymentId: payment.razorpayPaymentId } : null,
  });
}

/** Flattens a computed OrderTaxSnapshot's per-item tax data into the shape InvoiceModel.items stores. */
function snapshotToInvoiceItems(snapshot: OrderTaxSnapshot) {
  return snapshot.items.map((item) => ({ ...item }));
}

/** Reconstructs the InvoicePdfData shape from an already-persisted Invoice document — used by regenerateInvoice's re-render-only path so it never touches the tax engine again. */
function invoiceDocToPdfData(invoice: InvoiceDocument): InvoicePdfData {
  return {
    sellerNameSnapshot: invoice.sellerNameSnapshot ?? '',
    sellerGstinSnapshot: invoice.sellerGstinSnapshot ?? '',
    sellerAddressSnapshot: invoice.sellerAddressSnapshot ?? '',
    sellerDrugLicenseSnapshot: invoice.sellerDrugLicenseSnapshot ?? '',
    warehouseNameSnapshot: invoice.warehouseNameSnapshot ?? '',
    warehouseGstinSnapshot: invoice.warehouseGstinSnapshot ?? '',
    warehouseStateCodeSnapshot: invoice.warehouseStateCodeSnapshot ?? '',
    customerShippingStateSnapshot: invoice.customerShippingStateSnapshot ?? '',
    items: (invoice.items ?? []) as unknown as InvoiceLineTax[],
    taxableAmount: invoice.totals?.subtotal ?? 0, // see note below — kept for backward display only
    cgstAmount: invoice.gstBreakup?.cgst ?? 0,
    sgstAmount: invoice.gstBreakup?.sgst ?? 0,
    igstAmount: invoice.gstBreakup?.igst ?? 0,
    gstAmount: invoice.totals?.gst ?? 0,
    roundOffAmount: invoice.roundOffAmount ?? 0,
    finalAmount: invoice.finalAmount || invoice.totals?.grandTotal || 0,
  };
}

/** True for a MongoDB duplicate-key error (E11000) — the expected, safe outcome when two concurrent generateInvoiceForOrder(orderId) calls race on the new unique `orderId` index (Part 11/23). */
function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/**
 * Idempotent — called once per order (see order.service.ts's updateOrderStatus,
 * triggered on the transition to "packed", aligning invoice generation with
 * the documented pack-complete business flow rather than payment capture —
 * Part 10). Computes the full tax/legal snapshot EXACTLY ONCE (Part 15): if
 * an invoice already exists for this order — complete or not — its already-
 * frozen tax data is reused, never recalculated.
 */
export async function generateInvoiceForOrder(orderId: string): Promise<string> {
  const existing = await InvoiceModel.findOne({ orderId });
  if (existing?.pdfUrl) return existing.pdfUrl;

  const order = await OrderModel.findById(orderId);
  if (!order) throw new NotFoundError('Order');

  let invoice: HydratedDocument<InvoiceDocument> | null = existing;

  try {
    let invoiceNumber: string;
    let invoiceDate: Date;
    let pdfData: InvoicePdfData;

    if (existing) {
      // A draft/partial record already exists (e.g. a prior attempt crashed
      // or failed at the S3-upload step after reserving the invoice number
      // and freezing tax data) — reuse its frozen fields rather than
      // recomputing tax a second time (Part 15 immutability / Part 19: a
      // transient storage failure must not force the tax engine to re-run).
      invoiceNumber = existing.invoiceNumber;
      invoiceDate = existing.invoiceDate ?? existing.get('createdAt') ?? new Date();
      pdfData = invoiceDocToPdfData(existing);
    } else {
      const snapshot = await calculateOrderTax(order);
      invoiceNumber = await nextInvoiceNumber(snapshot.sellerId);
      invoiceDate = new Date();
      pdfData = snapshot;

      // Part 19 — the invoice row (with its frozen tax snapshot) is
      // persisted BEFORE attempting the S3 upload, in `documentStatus:
      // GENERATING`. If the upload then fails, the invoice is still
      // identifiable/queryable as "tax data generated, storage pending" —
      // never silently absent — and a retry skips straight to
      // render+upload without recomputing tax.
      invoice = await InvoiceModel.create({
        invoiceNumber,
        orderId: order._id,
        customerId: order.customerId,
        sellerId: order.sellerId ?? null,
        couponCode: order.couponCode,
        invoiceDate,
        totals: order.totals,
        sellerNameSnapshot: snapshot.sellerNameSnapshot,
        sellerGstinSnapshot: snapshot.sellerGstinSnapshot,
        sellerAddressSnapshot: snapshot.sellerAddressSnapshot,
        sellerDrugLicenseSnapshot: snapshot.sellerDrugLicenseSnapshot,
        warehouseId: snapshot.warehouseId,
        warehouseNameSnapshot: snapshot.warehouseNameSnapshot,
        warehouseGstinSnapshot: snapshot.warehouseGstinSnapshot,
        warehouseStateCodeSnapshot: snapshot.warehouseStateCodeSnapshot,
        customerShippingStateSnapshot: snapshot.customerShippingStateSnapshot,
        taxType: snapshot.taxType,
        items: snapshotToInvoiceItems(snapshot),
        gstBreakup: { cgst: snapshot.cgstAmount, sgst: snapshot.sgstAmount, igst: snapshot.igstAmount },
        roundOffAmount: snapshot.roundOffAmount,
        finalAmount: snapshot.finalAmount,
        status: INVOICE_STATUS.DRAFT,
        documentStatus: DOCUMENT_STATUS.GENERATING,
      });
    }

    const pdfBuffer = await renderInvoicePdfBuffer(order, invoiceNumber, invoiceDate, pdfData);
    const sellerId = order.sellerId ? String(order.sellerId) : null;
    const { ref, storageProvider } = await uploadAndRecordDocument({
      documentType: DOCUMENT_TYPES.INVOICE,
      entityId: String(order._id),
      objectKeyId: invoiceNumber,
      sellerId,
      buffer: pdfBuffer,
      fileName: `${invoiceNumber}.pdf`,
    });

    invoice!.status = INVOICE_STATUS.GENERATED;
    invoice!.pdfUrl = ref;
    invoice!.storageProvider = storageProvider;
    invoice!.documentStatus = DOCUMENT_STATUS.AVAILABLE;
    await invoice!.save();

    await recordAudit({
      actorId: null,
      actorType: ACTOR_TYPES.SYSTEM,
      action: INVOICE_AUDIT_ACTIONS.INVOICE_GENERATED,
      resource: 'invoice',
      resourceId: String(invoice!._id),
      after: { invoiceNumber, orderId: String(order._id), sellerId: order.sellerId ? String(order.sellerId) : null },
    });

    return invoice!.pdfUrl!;
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      // Lost the race to a concurrent call — that one already created (or is
      // about to finish creating) the authoritative invoice; use it instead
      // of erroring out (Part 11/23: exactly one invoice, no duplicates).
      const winner = await InvoiceModel.findOne({ orderId });
      if (winner?.pdfUrl) return winner.pdfUrl;
    }

    await recordAudit({
      actorId: null,
      actorType: ACTOR_TYPES.SYSTEM,
      action: INVOICE_AUDIT_ACTIONS.INVOICE_GENERATION_FAILED,
      resource: 'invoice',
      resourceId: orderId,
      result: 'failure',
      failureReason: err instanceof Error ? err.message : 'Unknown error',
    });
    throw err;
  }
}

export async function getInvoiceByOrderId(orderId: string, requesterId: string) {
  const invoice = await InvoiceModel.findOne({ orderId, customerId: requesterId }).lean();
  if (!invoice) throw new NotFoundError('Invoice');
  return invoice;
}

export function listMyInvoices(customerId: string) {
  return InvoiceModel.find({ customerId }).sort({ createdAt: -1 }).lean();
}

/**
 * Part 12/13/38 — silent, system-triggered recovery for an invoice
 * whose S3 object was already deleted by the retention sweep
 * (document-retention-sweep.job.ts): re-renders from the SAME frozen tax
 * snapshot `regenerateInvoice` re-renders from (never recomputes tax, never
 * touches the current Product/GST/shipping configuration — Part 8/38), and
 * re-uploads. Deliberately distinct from `regenerateInvoice` below (the
 * admin-triggered "reprint" action) in two ways: no customer email is sent
 * (this fires transparently on an ordinary download request, an admin or
 * customer clicking "download" isn't asking to be re-notified), and the
 * actor is always SYSTEM (`generatedBy: null`) since no human initiated it.
 */
async function regenerateInvoicePdfAfterExpiry(invoice: HydratedDocument<InvoiceDocument>): Promise<void> {
  const order = await OrderModel.findById(invoice.orderId);
  if (!order) throw new NotFoundError('Order');

  const pdfBuffer = await renderInvoicePdfBuffer(
    order,
    invoice.invoiceNumber,
    invoice.invoiceDate ?? new Date(),
    invoiceDocToPdfData(invoice),
  );
  const { ref, storageProvider } = await uploadAndRecordDocument({
    documentType: DOCUMENT_TYPES.INVOICE,
    entityId: String(order._id),
    objectKeyId: invoice.invoiceNumber,
    sellerId: invoice.sellerId ? String(invoice.sellerId) : null,
    buffer: pdfBuffer,
    fileName: `${invoice.invoiceNumber}.pdf`,
  });

  const nextVersion = invoice.regenerations.length + 1;
  invoice.regenerations.push({ version: nextVersion, pdfUrl: ref, generatedBy: null, generatedAt: new Date() });
  invoice.pdfUrl = ref;
  invoice.storageProvider = storageProvider;
  invoice.documentStatus = DOCUMENT_STATUS.AVAILABLE;
  await invoice.save();

  await recordAudit({
    actorId: null,
    actorType: ACTOR_TYPES.SYSTEM,
    action: FULFILLMENT_AUDIT_ACTIONS.DOCUMENT_REGENERATED_AFTER_EXPIRY,
    resource: 'invoice',
    resourceId: String(invoice._id),
    after: { pdfUrl: ref, version: nextVersion },
  });
}

/**
 * Part 38 — "check DB metadata -> check S3 object -> if it exists use it,
 * else rebuild from immutable DB data -> upload -> update DB." Shared by
 * both the customer and admin download paths below. Only ever does the
 * (cheap) existence check for S3-backed invoices — Cloudinary-backed
 * legacy rows are always already a public, standing URL with no retention
 * sweep touching them (see document-retention-sweep.job.ts's explicit S3-only
 * scope), so there is nothing to verify for them.
 */
export async function ensureInvoicePdfAvailable(invoice: HydratedDocument<InvoiceDocument>): Promise<void> {
  if (!invoice.pdfUrl) throw new UnprocessableEntityError('Invoice PDF is not ready yet');
  if (invoice.storageProvider !== STORAGE_PROVIDERS.S3) return;

  const stillExists = invoice.documentStatus !== DOCUMENT_STATUS.EXPIRED && (await s3Ops.objectExists(invoice.pdfUrl));
  if (!stillExists) {
    await regenerateInvoicePdfAfterExpiry(invoice);
  }
}

/**
 * Part 9/10 — the ONLY path that ever turns a stored invoice
 * reference into an actually-fetchable link. List/detail reads above return
 * raw metadata (`pdfUrl` there is the private S3 object key, not a working
 * URL, for S3-backed invoices); this generates a fresh short-lived presigned
 * URL on demand, after re-checking ownership via getInvoiceByOrderId.
 */
export async function getInvoiceDownloadUrl(
  orderId: string,
  requesterId: string,
): Promise<{ url: string; expiresInSeconds: number }> {
  const invoiceLean = await getInvoiceByOrderId(orderId, requesterId);
  const invoice = await InvoiceModel.findById(invoiceLean._id);
  if (!invoice) throw new NotFoundError('Invoice');
  await ensureInvoicePdfAvailable(invoice);

  const expiresInSeconds = 300;
  const url = await resolveDocumentDownloadUrl(invoice.storageProvider, invoice.pdfUrl, expiresInSeconds);
  if (!url) throw new UnprocessableEntityError('Invoice PDF is not ready yet');
  return { url, expiresInSeconds };
}

/**
 * Admin-triggered reprint. If an invoice already exists, this ONLY re-renders
 * the PDF from the already-frozen tax snapshot (Part 15 immutability) and
 * archives the previous version in `regenerations`. If no invoice exists yet
 * for this order (e.g. an admin manually triggers generation ahead of the
 * normal pack-complete flow), this is equivalent to first-time generation —
 * the tax snapshot is computed once, here, and then frozen exactly the same
 * as the automatic path.
 */
export async function regenerateInvoice(
  orderId: string,
  actorId: string,
  actorRole?: Role,
): Promise<InvoiceDocument> {
  const order = await OrderModel.findById(orderId);
  if (!order) throw new NotFoundError('Order');

  let invoice = await InvoiceModel.findOne({ orderId: order._id });

  if (!invoice) {
    const snapshot = await calculateOrderTax(order);
    const invoiceNumber = await nextInvoiceNumber(snapshot.sellerId);
    const invoiceDate = new Date();
    const pdfBuffer = await renderInvoicePdfBuffer(order, invoiceNumber, invoiceDate, snapshot);
    const sellerIdStr = order.sellerId ? String(order.sellerId) : null;
    const { ref, storageProvider } = await uploadAndRecordDocument({
      documentType: DOCUMENT_TYPES.INVOICE,
      entityId: String(order._id),
      objectKeyId: invoiceNumber,
      sellerId: sellerIdStr,
      buffer: pdfBuffer,
      fileName: `${invoiceNumber}.pdf`,
    });

    invoice = await InvoiceModel.create({
      invoiceNumber,
      orderId: order._id,
      customerId: order.customerId,
      sellerId: order.sellerId ?? null,
      sellerNameSnapshot: snapshot.sellerNameSnapshot,
      sellerGstinSnapshot: snapshot.sellerGstinSnapshot,
      sellerAddressSnapshot: snapshot.sellerAddressSnapshot,
      sellerDrugLicenseSnapshot: snapshot.sellerDrugLicenseSnapshot,
      warehouseId: snapshot.warehouseId,
      warehouseNameSnapshot: snapshot.warehouseNameSnapshot,
      warehouseGstinSnapshot: snapshot.warehouseGstinSnapshot,
      warehouseStateCodeSnapshot: snapshot.warehouseStateCodeSnapshot,
      customerShippingStateSnapshot: snapshot.customerShippingStateSnapshot,
      taxType: snapshot.taxType,
      items: snapshotToInvoiceItems(snapshot),
      gstBreakup: { cgst: snapshot.cgstAmount, sgst: snapshot.sgstAmount, igst: snapshot.igstAmount },
      totals: order.totals,
      roundOffAmount: snapshot.roundOffAmount,
      finalAmount: snapshot.finalAmount,
      invoiceDate,
      couponCode: order.couponCode,
      status: INVOICE_STATUS.GENERATED,
      pdfUrl: ref,
      storageProvider,
      documentStatus: DOCUMENT_STATUS.AVAILABLE,
      regenerations: [{ version: 1, pdfUrl: ref, generatedBy: actorId, generatedAt: new Date() }],
      createdBy: actorId,
    });

    await recordAudit({
      actorId,
      actorType: actorRole ? actorTypeForRole(actorRole) : undefined,
      action: INVOICE_AUDIT_ACTIONS.INVOICE_GENERATED,
      resource: 'invoice',
      resourceId: String(invoice._id),
      after: { invoiceNumber, orderId: String(order._id) },
    });
  } else {
    const before = { pdfUrl: invoice.pdfUrl, status: invoice.status };
    const pdfBuffer = await renderInvoicePdfBuffer(
      order,
      invoice.invoiceNumber,
      invoice.invoiceDate ?? new Date(),
      invoiceDocToPdfData(invoice),
    );
    const { ref, storageProvider } = await uploadAndRecordDocument({
      documentType: DOCUMENT_TYPES.INVOICE,
      entityId: String(order._id),
      objectKeyId: invoice.invoiceNumber,
      sellerId: invoice.sellerId ? String(invoice.sellerId) : null,
      buffer: pdfBuffer,
      fileName: `${invoice.invoiceNumber}.pdf`,
    });

    const nextVersion = invoice.regenerations.length + 1;
    invoice.regenerations.push({ version: nextVersion, pdfUrl: ref, generatedBy: actorId, generatedAt: new Date() });
    invoice.pdfUrl = ref;
    invoice.storageProvider = storageProvider;
    invoice.documentStatus = DOCUMENT_STATUS.AVAILABLE;
    invoice.status = INVOICE_STATUS.GENERATED;
    invoice.set('updatedBy', actorId);
    await invoice.save();

    await recordAudit({
      actorId,
      actorType: actorRole ? actorTypeForRole(actorRole) : undefined,
      action: INVOICE_AUDIT_ACTIONS.INVOICE_REGENERATED,
      resource: 'invoice',
      resourceId: String(invoice._id),
      before,
      after: { pdfUrl: invoice.pdfUrl, status: invoice.status, version: nextVersion },
    });
  }

  try {
    const customer = await UserModel.findById(order.customerId).select('email name').lean();
    if (customer?.email) {
      const emailLink = await resolveDocumentDownloadUrl(
        invoice.storageProvider,
        invoice.pdfUrl,
        EMAIL_LINK_TTL_SECONDS,
      );
      await enqueueNotification({
        channel: 'email',
        templateKey: 'invoice_email',
        recipient: customer.email,
        userId: String(order.customerId),
        data: {
          invoiceNumber: invoice.invoiceNumber,
          pdfUrl: emailLink,
          orderNumber: order.orderNumber,
        },
      });
    }
  } catch {
    // Notification failure must never fail a regeneration that already succeeded.
  }

  return invoice;
}

/** Customer-facing — emails the already-generated invoice PDF to the requesting customer. Ownership is enforced via the `customerId` filter. */
export async function sendInvoiceEmail(orderId: string, userId: string): Promise<void> {
  const invoice = await InvoiceModel.findOne({ orderId, customerId: userId });
  if (!invoice) throw new NotFoundError('Invoice');
  if (!invoice.pdfUrl) throw new UnprocessableEntityError('Invoice PDF is not ready yet');

  const [order, customer] = await Promise.all([
    OrderModel.findById(orderId).select('orderNumber').lean(),
    UserModel.findById(userId).select('email').lean(),
  ]);
  if (!customer?.email) throw new UnprocessableEntityError('Customer does not have an email on file');

  // Email is async/non-interactive (Part 8/9's "short-lived" is relative to
  // a permanently-public URL, not to an on-demand API read) — a 24h presigned
  // link is used here specifically so the email stays usable for a
  // reasonable window after delivery, still far short of a permanent link.
  const emailLink = await resolveDocumentDownloadUrl(
    invoice.storageProvider,
    invoice.pdfUrl,
    EMAIL_LINK_TTL_SECONDS,
  );

  await enqueueNotification({
    channel: 'email',
    templateKey: 'invoice_email',
    recipient: customer.email,
    userId,
    data: {
      invoiceNumber: invoice.invoiceNumber,
      pdfUrl: emailLink,
      orderNumber: order?.orderNumber,
    },
  });

  await recordAudit({
    actorId: userId,
    action: 'update',
    resource: 'invoice',
    resourceId: String(invoice._id),
    after: { emailedTo: customer.email },
  });
}
