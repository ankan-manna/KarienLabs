import type { Role } from '@medcommerce/shared';
import mongoose from 'mongoose';

import { ConflictError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { batchRepository } from '../inventory/batch.repository';

import { computeBundleAvailableUnits } from './bundle-availability.util';
import { BundleItemModel } from './models/bundle-item.model';
import { BundleModel } from './models/bundle.model';
import { ProductModel } from './models/product.model';

interface Actor {
  id: string;
  role?: Role;
}

interface BundleItemInput {
  componentProductId: string;
  quantity: number;
}

interface CreateBundleInput {
  productId: string;
  sellingPrice: number;
  isActive?: boolean;
  items: BundleItemInput[];
}

function auditBundleChange(
  actor: Actor,
  action: 'create' | 'update' | 'delete',
  bundleId: string,
  before?: unknown,
  after?: unknown,
) {
  return recordAudit({
    actorId: actor.id,
    actorType: actor.role ? actorTypeForRole(actor.role) : undefined,
    action,
    resource: 'bundle',
    resourceId: bundleId,
    before,
    after,
  });
}

/**
 * Walks the (recursive) component closure of `productId` — i.e. every
 * product reachable by following "this product is a bundle whose items
 * include product X" edges — so `assertNoCyclicReference` can detect not
 * just a direct self-reference but a deeper cycle (Bundle A -> Bundle B ->
 * Bundle A). `visited` bounds the walk even against already-corrupt data
 * (can't happen going forward since this same check gates every write, but
 * defends against it regardless).
 */
async function collectComponentClosure(productId: string, visited: Set<string>): Promise<void> {
  if (visited.has(productId)) return;
  visited.add(productId);

  const bundle = await BundleModel.findOne({ productId }).lean();
  if (!bundle) return;

  const items = await BundleItemModel.find({ bundleId: bundle._id }).select('componentProductId').lean();
  for (const item of items) {
    await collectComponentClosure(String(item.componentProductId), visited);
  }
}

/** Part 8 validation: "Bundle A -> Bundle B -> Bundle A must be rejected." */
async function assertNoCyclicReference(
  bundleProductId: string,
  componentProductIds: string[],
): Promise<void> {
  for (const componentProductId of componentProductIds) {
    if (componentProductId === bundleProductId) {
      throw new UnprocessableEntityError('A bundle cannot contain itself as a component');
    }
    const closure = new Set<string>();
    await collectComponentClosure(componentProductId, closure);
    if (closure.has(bundleProductId)) {
      throw new UnprocessableEntityError(
        'Circular bundle reference detected — a component (directly or indirectly) contains this bundle itself',
      );
    }
  }
}

interface ComponentWithRatio extends BundleItemInput {
  priceRatio: number;
}

/**
 * priceRatio = (component.mrp * quantity) / sum(component.mrp * quantity
 * across all items) — the value each component-quantity contributes to the
 * combined pack's list price. Used later ONLY for tax apportionment (Part
 * 7), never to compute what the customer is charged (Bundle.sellingPrice is
 * independent, set by the admin).
 */
async function computeItemsWithPriceRatio(items: BundleItemInput[]): Promise<{
  itemsWithRatio: ComponentWithRatio[];
  componentIds: string[];
}> {
  if (items.length === 0) {
    throw new UnprocessableEntityError('A bundle must have at least one component product');
  }

  const componentIds = items.map((i) => i.componentProductId);
  if (new Set(componentIds).size !== componentIds.length) {
    throw new UnprocessableEntityError('A bundle cannot list the same component product twice');
  }
  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw new UnprocessableEntityError('Component quantity must be a positive number');
    }
  }

  const components = await ProductModel.find({ _id: { $in: componentIds }, deletedAt: null })
    .select('name mrp isActive isBundle')
    .lean();
  if (components.length !== componentIds.length) {
    throw new NotFoundError('One or more component products');
  }
  const componentMap = new Map(components.map((c) => [String(c._id), c]));

  // Part 4/12 — an inactive/disabled product must not silently become a
  // valid component (its own availability would then never surface to the
  // customer, and it may be intentionally retired from sale). Likewise, a
  // component that is ITSELF a bundle/combo SKU is rejected outright: it
  // carries no batches of its own (see bundle-availability.util.ts), so
  // nesting one bundle inside another would make the outer bundle's
  // available-stock computation and checkout's FEFO stock-plan expansion
  // (order.service.ts) silently wrong. The existing cyclic-reference check
  // below only catches genuine cycles (A -> B -> A), not one-way nesting
  // (A contains B, B is a bundle of C) — this is deliberately a separate,
  // stricter rule.
  for (const item of items) {
    const comp = componentMap.get(item.componentProductId)!;
    if (!comp.isActive) {
      throw new UnprocessableEntityError(
        `Component product "${comp.name}" is inactive and cannot be used in a bundle`,
      );
    }
    if (comp.isBundle) {
      throw new UnprocessableEntityError(
        `Component product "${comp.name}" is itself a bundle/combo SKU — nested combos are not supported`,
      );
    }
  }

  const contributions = items.map((item) => {
    const comp = componentMap.get(item.componentProductId)!;
    return { ...item, contribution: comp.mrp * item.quantity };
  });
  const totalContribution = contributions.reduce((sum, c) => sum + c.contribution, 0);
  if (totalContribution <= 0) {
    throw new UnprocessableEntityError(
      'Component products must have a positive MRP to compute price ratios',
    );
  }

  const itemsWithRatio: ComponentWithRatio[] = contributions.map((c) => ({
    componentProductId: c.componentProductId,
    quantity: c.quantity,
    priceRatio: c.contribution / totalContribution,
  }));

  return { itemsWithRatio, componentIds };
}

export async function createBundle(input: CreateBundleInput, actor: Actor) {
  if (input.sellingPrice < 0) throw new UnprocessableEntityError('Selling price cannot be negative');

  const bundleProduct = await ProductModel.findById(input.productId);
  if (!bundleProduct) throw new NotFoundError('Product');
  if (await BundleModel.findOne({ productId: input.productId })) {
    throw new ConflictError('This product already has a bundle configuration');
  }

  const { itemsWithRatio, componentIds } = await computeItemsWithPriceRatio(input.items);
  await assertNoCyclicReference(input.productId, componentIds);

  const session = await mongoose.startSession();
  let bundleId = '';
  try {
    await session.withTransaction(async () => {
      const [bundle] = await BundleModel.create(
        [
          {
            productId: input.productId,
            sellingPrice: input.sellingPrice,
            isActive: input.isActive ?? true,
            createdBy: actor.id,
          },
        ],
        { session },
      );
      bundleId = String(bundle._id);

      await BundleItemModel.create(
        itemsWithRatio.map((item) => ({
          bundleId: bundle._id,
          componentProductId: item.componentProductId,
          quantity: item.quantity,
          priceRatio: item.priceRatio,
          createdBy: actor.id,
        })),
        { session, ordered: true },
      );

      // Part 5 pricing rule: `Bundle.sellingPrice` is the single admin-controlled
      // combo price; `Product.basePrice` is kept in sync as a denormalized cache
      // so every code path that already reads a plain product's price (catalog
      // listing, search, cart add) shows the correct combo price WITHOUT needing
      // to become Bundle-aware itself. This mirrors the existing
      // `Product.gstRate` <- `ProductTaxMapping` denormalized-cache pattern
      // already used elsewhere in this codebase. Checkout itself never reads
      // `Product.basePrice` for a bundle line (see order.service.ts's
      // `getBundleForCheckout` usage) — it already reads `Bundle.sellingPrice`
      // directly, so this sync is purely a display/cart-preview correctness fix
      // and cannot double-apply or conflict with checkout math.
      await ProductModel.updateOne(
        { _id: input.productId },
        { isBundle: true, basePrice: input.sellingPrice, updatedBy: actor.id },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  await auditBundleChange(actor, 'create', bundleId, null, {
    productId: input.productId,
    sellingPrice: input.sellingPrice,
    componentCount: itemsWithRatio.length,
  });

  return getBundleById(bundleId);
}

interface UpdateBundleInput {
  sellingPrice?: number;
  isActive?: boolean;
  items?: BundleItemInput[];
}

export async function updateBundle(id: string, input: UpdateBundleInput, actor: Actor) {
  const bundle = await BundleModel.findById(id);
  if (!bundle) throw new NotFoundError('Bundle');

  const before = { sellingPrice: bundle.sellingPrice, isActive: bundle.isActive };

  if (input.sellingPrice !== undefined) {
    if (input.sellingPrice < 0) throw new UnprocessableEntityError('Selling price cannot be negative');
    bundle.sellingPrice = input.sellingPrice;
  }
  if (input.isActive !== undefined) bundle.isActive = input.isActive;
  bundle.set('updatedBy', actor.id);

  if (input.items) {
    const { itemsWithRatio, componentIds } = await computeItemsWithPriceRatio(input.items);
    await assertNoCyclicReference(String(bundle.productId), componentIds);

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await bundle.save({ session });
        await BundleItemModel.deleteMany({ bundleId: bundle._id }, { session });
        await BundleItemModel.create(
          itemsWithRatio.map((item) => ({
            bundleId: bundle._id,
            componentProductId: item.componentProductId,
            quantity: item.quantity,
            priceRatio: item.priceRatio,
            createdBy: actor.id,
          })),
          { session },
        );
        if (input.sellingPrice !== undefined) {
          // Part 5 — keep the denormalized `Product.basePrice` cache in sync
          // whenever the admin-controlled combo price changes (see the same
          // comment in `createBundle` for why this is safe/non-conflicting
          // with checkout, which reads `Bundle.sellingPrice` directly).
          await ProductModel.updateOne(
            { _id: bundle.productId },
            { basePrice: input.sellingPrice, updatedBy: actor.id },
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }
  } else {
    if (input.sellingPrice !== undefined) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await bundle.save({ session });
          await ProductModel.updateOne(
            { _id: bundle.productId },
            { basePrice: input.sellingPrice, updatedBy: actor.id },
            { session },
          );
        });
      } finally {
        await session.endSession();
      }
    } else {
      await bundle.save();
    }
  }

  await auditBundleChange(actor, 'update', id, before, {
    sellingPrice: bundle.sellingPrice,
    isActive: bundle.isActive,
  });

  return getBundleById(id);
}

export async function deleteBundle(id: string, actor: Actor) {
  const bundle = await BundleModel.findById(id);
  if (!bundle) throw new NotFoundError('Bundle');

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await BundleModel.updateOne(
        { _id: id },
        { deletedAt: new Date(), deletedBy: actor.id },
        { session },
      );
      await BundleItemModel.updateMany(
        { bundleId: id },
        { deletedAt: new Date(), deletedBy: actor.id },
        { session },
      );
      // Only unsets isBundle if this was indeed the product's bundle config —
      // safe because of the one-bundle-per-product unique index.
      await ProductModel.updateOne(
        { _id: bundle.productId },
        { isBundle: false, updatedBy: actor.id },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  await auditBundleChange(actor, 'delete', id);
}

/**
 * Admin detail view: bundle + component list with product name/sku/mrp/gstRate
 * and the stored priceRatio (Part 8: "Price ratio preview"), plus (Part 13
 * "VIEW: ... calculated inventory") the SAME canonical, component-derived
 * `availableQty` the storefront uses — never a second, independently
 * computed number.
 */
export async function getBundleById(id: string) {
  const bundle = await BundleModel.findById(id).lean();
  if (!bundle) throw new NotFoundError('Bundle');

  const [bundleProduct, items, availabilityMap] = await Promise.all([
    ProductModel.findById(bundle.productId).select('name sku mrp images').lean(),
    BundleItemModel.find({ bundleId: id }).lean(),
    resolveProductAvailability([String(bundle.productId)]),
  ]);

  const componentProducts = await ProductModel.find({
    _id: { $in: items.map((i) => i.componentProductId) },
  })
    .select('name sku mrp gstRate medicine.hsnCode')
    .lean();
  const componentMap = new Map(componentProducts.map((p) => [String(p._id), p]));

  return {
    ...bundle,
    availableQty: availabilityMap.get(String(bundle.productId)) ?? 0,
    product: bundleProduct
      ? { _id: bundleProduct._id, name: bundleProduct.name, sku: bundleProduct.sku, mrp: bundleProduct.mrp }
      : null,
    items: items.map((item) => {
      const comp = componentMap.get(String(item.componentProductId));
      return {
        _id: item._id,
        componentProductId: item.componentProductId,
        quantity: item.quantity,
        priceRatio: item.priceRatio,
        component: comp
          ? { name: comp.name, sku: comp.sku, mrp: comp.mrp, gstRate: comp.gstRate, hsnCode: comp.medicine?.hsnCode }
          : null,
      };
    }),
  };
}

/**
 * Enriches each bundle with its product name/sku, plus its canonical
 * component-derived `availableQty` (Part 13/20 — one batched lookup for the
 * whole page, not one per row), so the admin list table doesn't need a
 * second round-trip per row — mirrors the same shape getBundleById() uses
 * for the single-record case.
 */
export async function listBundles(query: ListQuery) {
  const skip = (query.page - 1) * query.limit;
  const [items, total] = await Promise.all([
    BundleModel.find(query.filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    BundleModel.countDocuments(query.filter),
  ]);

  const [products, availabilityMap] = await Promise.all([
    ProductModel.find({ _id: { $in: items.map((b) => b.productId) } })
      .select('name sku')
      .lean(),
    resolveProductAvailability(items.map((b) => String(b.productId))),
  ]);
  const productMap = new Map(products.map((p) => [String(p._id), p]));

  return {
    items: items.map((b) => ({
      ...b,
      availableQty: availabilityMap.get(String(b.productId)) ?? 0,
      product: productMap.get(String(b.productId)) ?? null,
    })),
    meta: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export interface BundleForCheckout {
  bundleId: string;
  sellingPrice: number;
  items: { componentProductId: string; quantity: number; priceRatio: number }[];
}

/**
 * Used by order.service.ts's checkout to (a) charge the bundle's own
 * independently-set `sellingPrice` rather than summing components, and (b)
 * expand the purchase into per-component FEFO reservations. Returns `null`
 * for a plain (non-bundle) product, or a disabled bundle (Part 12 — a
 * disabled bundle should not be purchasable even if its underlying product
 * is still `isActive`).
 */
export async function getBundleForCheckout(productId: string): Promise<BundleForCheckout | null> {
  const bundle = await BundleModel.findOne({ productId, isActive: true, deletedAt: null }).lean();
  if (!bundle) return null;
  const items = await BundleItemModel.find({ bundleId: bundle._id, deletedAt: null }).lean();
  return {
    bundleId: String(bundle._id),
    sellingPrice: bundle.sellingPrice,
    items: items.map((i) => ({
      componentProductId: String(i.componentProductId),
      quantity: i.quantity,
      priceRatio: i.priceRatio,
    })),
  };
}

/**
 * THE canonical "how many can I sell right now" lookup for ANY product id —
 * plain SKU or bundle/combo SKU — used uniformly by product listing
 * (product.service.ts), product detail, and search (product-search.service.ts)
 * so a combo can never disagree about its own availability across surfaces
 * (same anti-duplication rule `batchRepository.getAvailableStockMap`'s own
 * doc comment already established for plain products — this function is the
 * bundle-aware superset of it, not a competing second implementation).
 *
 * - Plain product -> delegates straight to `batchRepository.getAvailableStockMap`
 *   (its own physical batch stock, unchanged).
 * - Bundle/combo product -> has NO batches of its own; its available quantity
 *   is DERIVED from its components' available stock via
 *   `computeBundleAvailableUnits` (MIN over components of
 *   floor(componentAvailable / requiredQtyPerCombo)). An inactive bundle
 *   (`Bundle.isActive === false`) always resolves to 0 — not purchasable,
 *   mirroring `getBundleForCheckout`'s existing gate.
 * - Never persisted/cached — recomputed from live Batch data on every call,
 *   so a component stock change is reflected on the very next read with no
 *   invalidation step required (Part 12/21: "must not use a manually
 *   editable/stale combo stock field").
 *
 * Batches DB round trips regardless of how many bundle ids are passed: one
 * query for the relevant Bundle docs, one for their BundleItems, one
 * aggregation for every unique component's stock, plus one aggregation for
 * the plain (non-bundle) products in the same call (Part 20/43 — no N+1).
 */
export async function resolveProductAvailability(productIds: string[]): Promise<Map<string, number>> {
  const uniqueIds = [...new Set(productIds)];
  if (uniqueIds.length === 0) return new Map();

  const bundles = await BundleModel.find({ productId: { $in: uniqueIds }, deletedAt: null })
    .select('productId isActive')
    .lean();
  const bundleProductIdSet = new Set(bundles.map((b) => String(b.productId)));
  const plainProductIds = uniqueIds.filter((id) => !bundleProductIdSet.has(id));

  const [plainStockMap, bundleAvailabilityMap] = await Promise.all([
    batchRepository.getAvailableStockMap(plainProductIds),
    computeBundleAvailabilityMap(bundles),
  ]);

  const result = new Map<string, number>(plainStockMap);
  for (const [productId, qty] of bundleAvailabilityMap) result.set(productId, qty);
  return result;
}

async function computeBundleAvailabilityMap(
  bundles: { _id: unknown; productId: unknown; isActive: boolean }[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (bundles.length === 0) return result;

  const activeBundles = bundles.filter((b) => b.isActive);
  for (const bundle of bundles) {
    if (!bundle.isActive) result.set(String(bundle.productId), 0);
  }
  if (activeBundles.length === 0) return result;

  const items = await BundleItemModel.find({
    bundleId: { $in: activeBundles.map((b) => b._id) },
    deletedAt: null,
  })
    .select('bundleId componentProductId quantity')
    .lean();

  const componentProductIds = [...new Set(items.map((i) => String(i.componentProductId)))];
  const componentStockMap = await batchRepository.getAvailableStockMap(componentProductIds);

  const itemsByBundleId = new Map<string, typeof items>();
  for (const item of items) {
    const key = String(item.bundleId);
    if (!itemsByBundleId.has(key)) itemsByBundleId.set(key, []);
    itemsByBundleId.get(key)!.push(item);
  }

  for (const bundle of activeBundles) {
    const bundleItems = itemsByBundleId.get(String(bundle._id)) ?? [];
    const units = computeBundleAvailableUnits(
      bundleItems.map((item) => ({
        availableQty: componentStockMap.get(String(item.componentProductId)) ?? 0,
        requiredQty: item.quantity,
      })),
    );
    result.set(String(bundle.productId), units);
  }
  return result;
}
