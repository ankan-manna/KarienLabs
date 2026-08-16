import { ProductModel } from '../catalog/models/product.model';
import { BatchModel } from '../inventory/models/batch.model';
import { WarehouseModel } from '../inventory/models/warehouse.model';

import type { OrderDocument } from './models/order.model';

/**
 * Shared fulfillment-context resolution — used by BOTH the tax/invoice engine
 * (tax-calculation.service.ts, Prompt 13) and the Shiprocket shipment engine
 * (shiprocket-fulfillment.service.ts, Prompt 14) so "which warehouse actually
 * fulfilled this order" is answered exactly once, the same way, everywhere.
 */

/**
 * Resolves the fulfilling warehouse (Seller -> Warehouse -> Warehouse
 * State/address, Part 2/5). Prefers the ACTUAL warehouse the first reserved
 * batch came from (`order.items[].batchId`, captured at checkout — see
 * order.service.ts) since that's the true point of supply/shipment origin;
 * falls back to the seller's first enabled warehouse for orders placed
 * before batchId capture existed, or where every line was a bundle whose
 * components somehow had no resolvable batch.
 */
export async function resolveFulfillingWarehouse(order: Pick<OrderDocument, 'items' | 'sellerId'>) {
  for (const item of order.items) {
    if (item.batchId) {
      const batch = await BatchModel.findById(item.batchId).select('warehouseId').lean();
      if (batch) {
        const warehouse = await WarehouseModel.findById(batch.warehouseId).lean();
        if (warehouse) return warehouse;
      }
    }
  }
  if (order.sellerId) {
    return WarehouseModel.findOne({ sellerId: order.sellerId, deletedAt: null }).lean();
  }
  return null;
}

export interface OrderPackageSpec {
  weightGrams: number;
  dimensions: { lengthMm: number; widthMm: number; heightMm: number };
  coldStorageRequired: boolean;
  /** Products referenced by the order that have no weight configured — surfaced so callers can warn rather than silently ship with an inaccurate weight (Part 6: "do not use random/default weight if product weight is available", implying that when it ISN'T available the gap must be visible, not hidden). */
  productsMissingWeight: string[];
}

export interface PackageEntryInput {
  productId: string;
  quantity: number;
  weightGrams?: number | null;
  lengthMm?: number | null;
  widthMm?: number | null;
  heightMm?: number | null;
  coldStorage?: boolean;
}

/**
 * Pure aggregation core of resolveOrderPackageSpec below — split out so the
 * weight-sum / max-dimension / cold-storage-OR logic (Part 6/7/8) is
 * independently unit-testable without a database (see
 * order-fulfillment.util.test.ts).
 *  - weight: sum(weightGrams x quantity) across every entry. No
 *    packaging-weight add-on — there is no packaging-weight configuration
 *    anywhere in this project, and Part 6 explicitly forbids inventing one.
 *  - dimensions: this project has no per-order packaging/box-selection
 *    engine, and Shiprocket's create-order API accepts exactly one
 *    length/width/height per shipment (not per item). Taking the max of each
 *    axis across every distinct product referenced is a conservative
 *    "would physically fit" approximation — documented here as a stand-in
 *    until a real packaging/box module exists (Part 7: "follow the existing
 *    packaging strategy rather than blindly selecting one product's
 *    dimensions" — there is no existing strategy to follow yet, so this is
 *    the safest default rather than an invented one).
 *  - coldStorageRequired: true if ANY entry is coldStorage — surfaced, never
 *    silently dropped (Part 8).
 */
export function aggregatePackageSpec(entries: PackageEntryInput[]): OrderPackageSpec {
  let weightGrams = 0;
  let lengthMm = 0;
  let widthMm = 0;
  let heightMm = 0;
  let coldStorageRequired = false;
  const productsMissingWeight: string[] = [];

  for (const entry of entries) {
    if (typeof entry.weightGrams === 'number' && entry.weightGrams > 0) {
      weightGrams += entry.weightGrams * entry.quantity;
    } else {
      productsMissingWeight.push(entry.productId);
    }
    if (typeof entry.lengthMm === 'number') lengthMm = Math.max(lengthMm, entry.lengthMm);
    if (typeof entry.widthMm === 'number') widthMm = Math.max(widthMm, entry.widthMm);
    if (typeof entry.heightMm === 'number') heightMm = Math.max(heightMm, entry.heightMm);
    if (entry.coldStorage) coldStorageRequired = true;
  }

  return {
    weightGrams: Math.round(weightGrams),
    dimensions: { lengthMm, widthMm, heightMm },
    coldStorageRequired,
    productsMissingWeight: [...new Set(productsMissingWeight)],
  };
}

/** Resolves an order's line items into product/batch data, then delegates the actual math to the pure aggregatePackageSpec above. */
export async function resolveOrderPackageSpec(
  order: Pick<OrderDocument, 'items'>,
): Promise<OrderPackageSpec> {
  const productIds = new Set<string>();
  for (const item of order.items) {
    productIds.add(String(item.productId));
    for (const comp of item.bundleComponents ?? []) productIds.add(String(comp.productId));
  }

  const products = await ProductModel.find({ _id: { $in: [...productIds] } })
    .select('weightGrams lengthMm widthMm heightMm medicine.coldStorage')
    .lean();
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  const entries: PackageEntryInput[] = [];
  for (const item of order.items) {
    if (item.bundleComponents && item.bundleComponents.length > 0) {
      for (const comp of item.bundleComponents) {
        const product = productMap.get(String(comp.productId));
        entries.push({
          productId: String(comp.productId),
          quantity: comp.quantity,
          weightGrams: product?.weightGrams,
          lengthMm: product?.lengthMm,
          widthMm: product?.widthMm,
          heightMm: product?.heightMm,
          coldStorage: product?.medicine?.coldStorage,
        });
      }
    } else {
      const product = productMap.get(String(item.productId));
      entries.push({
        productId: String(item.productId),
        quantity: item.quantity,
        weightGrams: product?.weightGrams,
        lengthMm: product?.lengthMm,
        widthMm: product?.widthMm,
        heightMm: product?.heightMm,
        coldStorage: product?.medicine?.coldStorage,
      });
    }
  }

  return aggregatePackageSpec(entries);
}
