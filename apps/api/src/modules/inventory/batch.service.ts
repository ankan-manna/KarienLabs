import { BATCH_STATUS, CATALOG_AUDIT_ACTIONS, type BatchStatus, type Role } from '@medcommerce/shared';

import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { ProductModel } from '../catalog/models/product.model';

import { resolveEffectiveBatchMrp } from './batch-pricing.util';
import { batchRepository } from './batch.repository';

interface Actor {
  id: string;
  role?: Role;
}

export function listBatches(query: ListQuery) {
  return batchRepository.paginate(query.filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
  });
}

export function getLowStockReport() {
  return batchRepository.findLowStock();
}

export async function getNearExpiryReport(withinDays: number) {
  const batches = await batchRepository.findNearExpiry(withinDays);
  return batches.map((batch) => ({ ...batch, effectiveStatus: computeBatchStatus(batch as never) }));
}

/**
 * Derives the effective status of a batch: "expired" and "exhausted" are
 * always computed from live data (expiryDate/quantityAvailable) rather than
 * trusted from the stored field, so they can never go stale. A manually-set
 * "flagged" status persists until an admin clears it (falls through to
 * whatever status is currently stored, e.g. via PATCH /batches/:id/status).
 */
export function computeBatchStatus(batch: {
  expiryDate: Date | string;
  quantityAvailable: number;
  status?: BatchStatus | string;
}): BatchStatus {
  if (new Date(batch.expiryDate) < new Date()) return BATCH_STATUS.EXPIRED;
  if (batch.quantityAvailable <= 0) return BATCH_STATUS.EXHAUSTED;
  return (batch.status as BatchStatus) ?? BATCH_STATUS.ACTIVE;
}

export async function getBatchById(id: string) {
  const batch = await batchRepository.findById(id);
  if (!batch) throw new NotFoundError('Batch');

  const product = await ProductModel.findById((batch as { productId: unknown }).productId)
    .select('mrp')
    .lean();

  return {
    ...batch,
    effectiveStatus: computeBatchStatus(batch as never),
    // CAT-04 — batch.mrp ?? product.mrp, computed once here so the admin
    // batch detail view and the future invoice engine don't each reimplement
    // the fallback (see batch-pricing.util.ts's resolveEffectiveBatchMrp).
    effectiveMrp: product ? resolveEffectiveBatchMrp(batch as { mrp?: number | null }, product) : null,
  };
}

/** Admin-settable override — e.g. manually flagging a suspect batch. */
export async function updateBatchStatus(id: string, status: BatchStatus, actorId: string) {
  const batch = await getBatchById(id);
  const updated = await batchRepository.updateById(id, { status, updatedBy: actorId });
  if (!updated) throw new NotFoundError('Batch');

  await recordAudit({
    actorId,
    action: 'update',
    resource: 'batch',
    resourceId: id,
    before: { status: (batch as { status?: string }).status },
    after: { status },
  });

  return updated;
}

/** CAT-04 — sets/clears the batch-specific MRP override. `null` clears back to "use Product.mrp" (see batch-pricing.util.ts). This is the catalog/pack MRP only — never the customer's selling price. */
export async function updateBatchMrp(id: string, mrp: number | null, actor: Actor) {
  const before = await batchRepository.findById(id);
  if (!before) throw new NotFoundError('Batch');
  if (mrp !== null && mrp < 0) throw new UnprocessableEntityError('MRP cannot be negative');

  const updated = await batchRepository.updateById(id, { mrp, updatedBy: actor.id });
  if (!updated) throw new NotFoundError('Batch');

  await recordAudit({
    actorId: actor.id,
    actorType: actor.role ? actorTypeForRole(actor.role) : undefined,
    action: CATALOG_AUDIT_ACTIONS.ADMIN_UPDATED_BATCH_MRP,
    resource: 'batch',
    resourceId: id,
    before: { mrp: (before as { mrp?: number | null }).mrp ?? null },
    after: { mrp },
  });

  return getBatchById(id);
}

/**
 * CAT-04/Part 5 — toggles whether this batch is eligible for NEW
 * reservation/picking (see order.service.ts's decrementStockFifo, which
 * excludes `recallFlag: true` from FEFO selection). Never touches
 * `quantityAvailable` or deletes the batch — existing orders/shipments that
 * already reserved from it, and the physical stock record itself, are left
 * completely intact; this only blocks future sales.
 */
export async function setBatchRecallFlag(
  id: string,
  recallFlag: boolean,
  actor: Actor,
  reason?: string,
) {
  const before = await batchRepository.findById(id);
  if (!before) throw new NotFoundError('Batch');

  const updated = await batchRepository.updateById(id, { recallFlag, updatedBy: actor.id });
  if (!updated) throw new NotFoundError('Batch');

  await recordAudit({
    actorId: actor.id,
    actorType: actor.role ? actorTypeForRole(actor.role) : undefined,
    action: recallFlag
      ? CATALOG_AUDIT_ACTIONS.ADMIN_RECALLED_BATCH
      : CATALOG_AUDIT_ACTIONS.ADMIN_UNRECALLED_BATCH,
    resource: 'batch',
    resourceId: id,
    before: { recallFlag: (before as { recallFlag?: boolean }).recallFlag ?? false },
    after: { recallFlag },
    metadata: reason ? { reason } : undefined,
  });

  return getBatchById(id);
}
