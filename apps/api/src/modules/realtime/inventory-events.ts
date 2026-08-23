import mongoose from 'mongoose';

import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import { resolveProductAvailability } from '../catalog/bundle.service';
import { BundleItemModel } from '../catalog/models/bundle-item.model';
import { BundleModel } from '../catalog/models/bundle.model';

/**
 * (inventory lifecycle) — there is no Socket.IO/SSE/pub-sub layer
 * anywhere in this codebase (confirmed by inspection: no `socket.io` or
 * `ws` dependency, no existing publisher). `ioredis` (already a dependency,
 * already connected — `config/redis.ts`) is the smallest available building
 * block for a fan-out broadcast, so inventory-change notifications are
 * published on this ONE Redis pub/sub channel; `inventory-events.routes.ts`
 * is the only subscriber, forwarding messages to browsers over Server-Sent
 * Events (native browser API, zero new frontend dependency). No new
 * database, no new message broker, no new npm package on either side.
 */
export const INVENTORY_EVENTS_CHANNEL = 'inventory:updates';

export interface InventoryUpdatedEvent {
  type: 'inventory.updated';
  productId: string;
  /**
   * Deliberately a boolean, not a raw quantity — matches the EXISTING
   * customer-facing contract exactly (`product.service.ts::getPublicProductDetail`
   * and `listProducts` both only ever expose `inStock: boolean`, never a
   * number). Part 30 forbids exposing more than customers already see;
   * inventing a numeric field here would be a NEW, wider disclosure this
   * event channel has no business introducing.
   */
  inStock: boolean;
  updatedAt: string;
}

/**
 * Reverse lookup for Part 17/18 — "SKU-1 changed -> find affected combos ->
 * recalculate -> publish." `BundleItem.componentProductId` already carries
 * an index (bundle-item.model.ts, from  1), so this is a single
 * indexed query, not a collection scan, and requires no new index.
 */
async function findAffectedComboProductIds(componentProductIds: string[]): Promise<string[]> {
  if (componentProductIds.length === 0) return [];

  const items = await BundleItemModel.find({
    componentProductId: { $in: componentProductIds.map((id) => new mongoose.Types.ObjectId(id)) },
    deletedAt: null,
  })
    .select('bundleId')
    .lean();
  if (items.length === 0) return [];

  const bundleIds = [...new Set(items.map((i) => String(i.bundleId)))];
  const bundles = await BundleModel.find({ _id: { $in: bundleIds }, deletedAt: null })
    .select('productId')
    .lean();
  return bundles.map((b) => String(b.productId));
}

/**
 * Called AFTER a stock-changing DB transaction has already committed (Part
 * 19: "never broadcast a stock value that was rolled back") — never inside
 * one, and never awaited as a precondition for the caller's own success.
 * Every failure is caught and logged here, not rethrown (Part 28: "realtime
 * delivery must NEVER determine whether inventory commit succeeds") — a
 * Redis outage degrades this to "customers refresh to see the new number,"
 * never a rolled-back or inconsistent order/inventory commit.
 */
export async function publishInventoryUpdate(changedProductIds: string[]): Promise<void> {
  const uniqueChanged = [...new Set(changedProductIds)];
  if (uniqueChanged.length === 0) return;

  try {
    const comboProductIds = await findAffectedComboProductIds(uniqueChanged);
    const allProductIds = [...new Set([...uniqueChanged, ...comboProductIds])];

    // The SAME canonical service every customer-facing surface already reads
    // (Part 3) — this event can never disagree with what a fresh page load
    // would show, because it IS that computation, just pushed proactively.
    const availabilityMap = await resolveProductAvailability(allProductIds);

    const updatedAt = new Date().toISOString();
    const events: InventoryUpdatedEvent[] = allProductIds.map((productId) => ({
      type: 'inventory.updated',
      productId,
      inStock: (availabilityMap.get(productId) ?? 0) > 0,
      updatedAt,
    }));

    await redis.publish(INVENTORY_EVENTS_CHANNEL, JSON.stringify({ events }));
  } catch (err) {
    logger.error(
      { err, changedProductIds: uniqueChanged },
      'Failed to publish inventory-updated event — inventory commit itself already succeeded and is unaffected',
    );
  }
}
