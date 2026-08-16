import {
  normalizeStateToGstCode,
  resolveGstTaxType,
  splitGst,
  type GstTaxType,
} from '@medcommerce/shared';
import type { HydratedDocument } from 'mongoose';

import { ProductModel } from '../catalog/models/product.model';
import { resolveEffectiveBatchMrp } from '../inventory/batch-pricing.util';
import { BatchModel } from '../inventory/models/batch.model';
import type { OrderDocument } from '../orders/models/order.model';
import { resolveFulfillingWarehouse } from '../orders/order-fulfillment.util';
import { SellerModel } from '../sellers/models/seller.model';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface InvoiceComponentTaxLine {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPriceShare: number;
  gstRate: number;
  hsnCode: string;
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
}

export interface InvoiceLineTax {
  productId: string;
  name: string;
  sku: string;
  batchId: string | null;
  batchNumber: string;
  hsnCode: string;
  mrp: number | null;
  quantity: number;
  unitPrice: number;
  gstRate: number;
  amount: number;
  taxableAmount: number;
  cgstRate: number;
  cgstAmount: number;
  sgstRate: number;
  sgstAmount: number;
  igstRate: number;
  igstAmount: number;
  /** Prompt 30 — this line's frozen product-level shipping contribution, read verbatim from `order.items[].shippingAmount` (never recomputed from the product's CURRENT shippingCharge — Part 16/17 immutability). */
  shippingAmount: number;
  bundleComponents?: InvoiceComponentTaxLine[];
}

export interface OrderTaxSnapshot {
  taxType: GstTaxType;
  warehouseId: string | null;
  warehouseNameSnapshot: string;
  warehouseGstinSnapshot: string;
  warehouseStateCodeSnapshot: string;
  customerShippingStateSnapshot: string;
  sellerId: string | null;
  sellerNameSnapshot: string;
  sellerGstinSnapshot: string;
  sellerAddressSnapshot: string;
  sellerDrugLicenseSnapshot: string;
  items: InvoiceLineTax[];
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  gstAmount: number;
  roundOffAmount: number;
  finalAmount: number;
}

/**
 * The one place order/seller/warehouse/product/batch data is resolved into a
 * frozen tax+legal snapshot — called exactly once, at first invoice
 * generation (see invoice.service.ts), never again afterward (Part 15
 * immutability: a regenerated PDF re-renders this same stored snapshot, it
 * does not call this function a second time).
 */
export async function calculateOrderTax(
  order: HydratedDocument<OrderDocument> & { _id: unknown },
): Promise<OrderTaxSnapshot> {
  const [seller, warehouse] = await Promise.all([
    order.sellerId ? SellerModel.findById(order.sellerId).lean() : Promise.resolve(null),
    resolveFulfillingWarehouse(order),
  ]);

  const warehouseStateCode = (warehouse as { stateCode?: string } | null)?.stateCode || null;
  const customerStateCode = normalizeStateToGstCode(order.shippingAddress?.state);
  const taxType = resolveGstTaxType(warehouseStateCode, customerStateCode);

  // Every product referenced anywhere in the order — top-level items AND
  // bundle components — fetched once, up front.
  const allProductIds = new Set<string>();
  for (const item of order.items) {
    allProductIds.add(String(item.productId));
    for (const comp of item.bundleComponents ?? []) allProductIds.add(String(comp.productId));
  }
  const products = await ProductModel.find({ _id: { $in: [...allProductIds] } })
    .select('mrp medicine.hsnCode')
    .lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const batchIds = order.items.map((i) => i.batchId).filter((id): id is NonNullable<typeof id> => !!id);
  const batches = batchIds.length
    ? await BatchModel.find({ _id: { $in: batchIds } }).select('batchNumber mrp').lean()
    : [];
  const batchMap = new Map(batches.map((b) => [String(b._id), b]));

  let taxableTotal = 0;
  let cgstTotal = 0;
  let sgstTotal = 0;
  let igstTotal = 0;

  const items: InvoiceLineTax[] = order.items.map((item) => {
    const product = productMap.get(String(item.productId));
    const batch = item.batchId ? batchMap.get(String(item.batchId)) : undefined;
    const effectiveMrp = product ? resolveEffectiveBatchMrp(batch ?? null, product) : null;

    if (item.bundleComponents && item.bundleComponents.length > 0) {
      // Bundle line — mixed GST is possible across components (Part 7).
      // Apportion the ALREADY-charged unitPriceShare per component; never
      // recompute what the customer paid (that stays the bundle's own
      // sellingPrice, snapshotted on `item.unitPrice`/`item.amount` at
      // checkout — see order.service.ts, unchanged here).
      const bundleComponents: InvoiceComponentTaxLine[] = item.bundleComponents.map((comp) => {
        const compProduct = productMap.get(String(comp.productId));
        const compTaxable = round2(comp.unitPriceShare * comp.quantity);
        const split = splitGst(compTaxable, comp.gstRate, taxType);
        return {
          productId: String(comp.productId),
          name: comp.name,
          sku: comp.sku,
          quantity: comp.quantity,
          unitPriceShare: comp.unitPriceShare,
          gstRate: comp.gstRate,
          hsnCode: compProduct?.medicine?.hsnCode ?? '',
          taxableAmount: compTaxable,
          ...split,
        };
      });

      const lineTaxable = round2(bundleComponents.reduce((s, c) => s + c.taxableAmount, 0));
      const lineCgst = round2(bundleComponents.reduce((s, c) => s + c.cgstAmount, 0));
      const lineSgst = round2(bundleComponents.reduce((s, c) => s + c.sgstAmount, 0));
      const lineIgst = round2(bundleComponents.reduce((s, c) => s + c.igstAmount, 0));

      taxableTotal += lineTaxable;
      cgstTotal += lineCgst;
      sgstTotal += lineSgst;
      igstTotal += lineIgst;

      return {
        productId: String(item.productId),
        name: item.name,
        sku: item.sku,
        batchId: item.batchId ? String(item.batchId) : null,
        batchNumber: batch?.batchNumber ?? '',
        // A bundle line spans multiple HSNs (one per component) — see
        // bundleComponents for the real per-HSN breakdown instead of a
        // single (necessarily wrong) line-level HSN.
        hsnCode: '',
        mrp: effectiveMrp,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        gstRate: item.gstRate,
        amount: item.amount,
        taxableAmount: lineTaxable,
        cgstRate: 0,
        cgstAmount: lineCgst,
        sgstRate: 0,
        sgstAmount: lineSgst,
        igstRate: 0,
        igstAmount: lineIgst,
        // Historical orders predating Prompt 30 have no `shippingAmount`
        // stored on their items — `?? 0` matches the schema's own
        // `default: 0`, never treated as a gap to backfill/recalculate.
        shippingAmount: item.shippingAmount ?? 0,
        bundleComponents,
      };
    }

    const taxableAmount = round2(item.unitPrice * item.quantity);
    const split = splitGst(taxableAmount, item.gstRate, taxType);
    taxableTotal += taxableAmount;
    cgstTotal += split.cgstAmount;
    sgstTotal += split.sgstAmount;
    igstTotal += split.igstAmount;

    return {
      productId: String(item.productId),
      name: item.name,
      sku: item.sku,
      batchId: item.batchId ? String(item.batchId) : null,
      batchNumber: batch?.batchNumber ?? '',
      hsnCode: product?.medicine?.hsnCode ?? '',
      mrp: effectiveMrp,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      gstRate: item.gstRate,
      amount: item.amount,
      taxableAmount,
      shippingAmount: item.shippingAmount ?? 0,
      ...split,
    };
  });

  taxableTotal = round2(taxableTotal);
  cgstTotal = round2(cgstTotal);
  sgstTotal = round2(sgstTotal);
  igstTotal = round2(igstTotal);
  const gstTotal = round2(cgstTotal + sgstTotal + igstTotal);

  const totals = order.totals!;
  const finalAmount = totals.grandTotal;
  // Reconciliation round-off (TAX-02): the order's own `grandTotal` was
  // already fixed at checkout (and is what was actually charged/payable —
  // never altered here). Re-deriving CGST/SGST/IGST per line with its own
  // rounding can differ from the order-level running-sum `totals.gst` by a
  // few paise; `roundOffAmount` is exactly that reconciling difference, not
  // a "round to nearest rupee" adjustment.
  const sumOfLineItems = round2(taxableTotal + gstTotal);
  const roundOffAmount = round2(finalAmount - totals.shipping + totals.discount - sumOfLineItems);

  return {
    taxType,
    warehouseId: warehouse ? String((warehouse as { _id: unknown })._id) : null,
    warehouseNameSnapshot: (warehouse as { name?: string } | null)?.name ?? '',
    warehouseGstinSnapshot: (warehouse as { gstin?: string } | null)?.gstin ?? '',
    warehouseStateCodeSnapshot: warehouseStateCode ?? '',
    customerShippingStateSnapshot: order.shippingAddress?.state ?? '',
    sellerId: order.sellerId ? String(order.sellerId) : null,
    sellerNameSnapshot: (seller as { legalName?: string } | null)?.legalName ?? '',
    sellerGstinSnapshot: (seller as { gstin?: string } | null)?.gstin ?? '',
    sellerAddressSnapshot: (seller as { address?: string } | null)?.address ?? '',
    sellerDrugLicenseSnapshot: (seller as { drugLicenseNumber?: string } | null)?.drugLicenseNumber ?? '',
    items,
    taxableAmount: taxableTotal,
    cgstAmount: cgstTotal,
    sgstAmount: sgstTotal,
    igstAmount: igstTotal,
    gstAmount: gstTotal,
    roundOffAmount,
    finalAmount,
  };
}
