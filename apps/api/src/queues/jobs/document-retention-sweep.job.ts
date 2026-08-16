import {
  ACTOR_TYPES,
  DOCUMENT_STATUS,
  DOCUMENT_TYPES,
  FULFILLMENT_AUDIT_ACTIONS,
  STORAGE_PROVIDERS,
} from '@medcommerce/shared';

import { logger } from '../../config/logger';
import { s3Ops } from '../../integrations/s3/s3-ops';
import { recordAudit } from '../../modules/audit/audit.service';
import { DocumentModel } from '../../modules/documents/models/document.model';
import { InvoiceModel } from '../../modules/invoices/models/invoice.model';
import { ShipmentModel } from '../../modules/orders/models/shipment.model';

const RETENTION_DOCUMENT_TYPES = [
  DOCUMENT_TYPES.INVOICE,
  DOCUMENT_TYPES.SHIPPING_LABEL,
  DOCUMENT_TYPES.RETURN_LABEL,
];
const SWEEP_BATCH_SIZE = 100;

/**
 * Reflects the S3-deletion outcome onto the OWNING business record's own
 * `documentStatus` (Invoice.documentStatus / Shipment.documentStatus) —
 * Part 11/18/19: the Document row is the storage-layer record, but admin
 * screens (InvoicesPage/ShipmentDetailDrawer) read the owning record's own
 * field, which must agree with what's actually still in S3.
 */
async function markOwningRecordExpired(
  documentType: (typeof RETENTION_DOCUMENT_TYPES)[number],
  entityId: unknown,
): Promise<void> {
  if (documentType === DOCUMENT_TYPES.INVOICE) {
    // entityId for an invoice Document is the ORDER id (see invoice.service.ts's
    // uploadAndRecordDocument call), not the Invoice's own _id.
    await InvoiceModel.updateOne({ orderId: entityId }, { documentStatus: DOCUMENT_STATUS.EXPIRED });
  } else {
    // Shipping/return labels use the Shipment's own _id as entityId.
    await ShipmentModel.updateOne({ _id: entityId }, { documentStatus: DOCUMENT_STATUS.EXPIRED });
  }
}

/**
 * Prompt 27 Part 19/37 — deletes S3 objects for invoice/label documents past
 * the configured retention window (~30 days default). CRITICAL invariant
 * (Part 19/37, tested explicitly — see the Prompt 4 report): "DELETE S3
 * OBJECT != DELETE DATABASE RECORD" — the Document/Invoice/Shipment rows
 * are NEVER deleted here, only their `status`/`documentStatus` flipped to
 * EXPIRED, preserving every field needed to regenerate later (Part 12/38).
 *
 * Walks `Document` records directly (not an S3 bucket listing, unlike
 * log-retention-sweep.job.ts) specifically because each one needs its OWN
 * DB status flip on deletion — a bucket-prefix scan has no way to do that.
 * Paginated (Part 24/48) via `_id` cursor so an arbitrarily large backlog
 * never loads into memory at once. If a specific object's S3 delete fails,
 * that one row is simply left AVAILABLE and picked up again by the next
 * daily run (Part 37: "If an S3 delete fails: do not delete DB metadata" —
 * extended here to "don't even mark it expired until the delete actually
 * succeeded").
 */
export async function runDocumentRetentionSweepJob(): Promise<number> {
  if (!(await s3Ops.isS3Configured())) return 0;

  const retentionDays = await s3Ops.getDocumentRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  let expiredCount = 0;
  let cursor: unknown = null;

  for (;;) {
    const filter: Record<string, unknown> = {
      documentType: { $in: RETENTION_DOCUMENT_TYPES },
      status: DOCUMENT_STATUS.AVAILABLE,
      storageProvider: STORAGE_PROVIDERS.S3,
      uploadedAt: { $lt: cutoff },
      ...(cursor ? { _id: { $gt: cursor } } : {}),
    };
    const page = await DocumentModel.find(filter)
      .select('_id documentType entityId objectKey')
      .sort({ _id: 1 })
      .limit(SWEEP_BATCH_SIZE)
      .lean();

    if (page.length === 0) break;

    for (const doc of page) {
      try {
        await s3Ops.deleteObject(doc.objectKey);
        await DocumentModel.updateOne({ _id: doc._id }, { status: DOCUMENT_STATUS.EXPIRED });
        await markOwningRecordExpired(
          doc.documentType as (typeof RETENTION_DOCUMENT_TYPES)[number],
          doc.entityId,
        );
        expiredCount += 1;
      } catch (error) {
        logger.error(
          { documentId: String(doc._id), objectKey: doc.objectKey, error },
          'Failed to expire document during retention sweep — left AVAILABLE for the next run',
        );
      }
    }

    cursor = page[page.length - 1]._id;
    if (page.length < SWEEP_BATCH_SIZE) break;
  }

  if (expiredCount > 0) {
    await recordAudit({
      actorId: null,
      actorType: ACTOR_TYPES.BACKGROUND_JOB,
      action: FULFILLMENT_AUDIT_ACTIONS.DOCUMENT_EXPIRED,
      resource: 'document',
      metadata: { expiredCount, retentionDays },
    });
    logger.info({ expiredCount, retentionDays }, 'Document retention sweep expired documents past retention');
  }

  return expiredCount;
}
