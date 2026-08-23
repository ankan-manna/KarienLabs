import {
  ACTOR_TYPES,
  DOCUMENT_STATUS,
  DOCUMENT_TYPES,
  NOTIFICATION_CATEGORIES,
  PRESCRIPTION_AUDIT_ACTIONS,
  PRESCRIPTION_STATUS,
  PRESCRIPTION_STATUS_TRANSITIONS,
  STORAGE_PROVIDERS,
  type PrescriptionStatus,
  type Role,
} from '@medcommerce/shared';
import mongoose from 'mongoose';

import { getSignedDeliveryUrl } from '../../integrations/cloudinary/cloudinary.service';
import { isS3Configured } from '../../integrations/s3/s3.client';
import { getPresignedDownloadUrl, getPresignedUploadUrl, objectExists } from '../../integrations/s3/storage.service';
import { assertValidPrescriptionFile, buildPrescriptionObjectKey } from '../../integrations/s3/storage.util';
import { ForbiddenError, NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { recordAudit } from '../audit/audit.service';
import { actorTypeForRole } from '../auth/actor-context.util';
import { UserModel } from '../auth/models/user.model';
import { upsertDocumentRecord } from '../documents/document.service';
import { enqueueNotification, notifyAdmins } from '../notifications/notification.service';
import { OrderModel } from '../orders/models/order.model';

import { PrescriptionUploadModel, type PrescriptionUploadDocument } from './models/prescription-upload.model';
import { getPrescriptionConfig } from './prescription-config.service';

/**
 * Part 11/52 — prescription notifications respect
 * `prescription.managementEnabled` (the existing config) as their
 * OWN gate before even reaching enqueueNotification's category toggle — a
 * disabled prescription FEATURE shouldn't fire prescription EMAILS either,
 * even if `prescriptionNotificationsEnabled` happens to still be on.
 */
async function notifyPrescriptionEvent(
  userId: string,
  templateKey: string,
  orderId: string | null | undefined,
  extraData: Record<string, unknown> = {},
): Promise<void> {
  const customer = await UserModel.findById(userId).select('email name').lean();
  if (!customer?.email) return;

  await enqueueNotification({
    channel: 'email',
    templateKey,
    recipient: customer.email,
    userId,
    orderId: orderId ?? undefined,
    category: NOTIFICATION_CATEGORIES.PRESCRIPTION,
    data: { customerName: customer.name, ...extraData },
  });
}

function resolveActorType(actorRole?: Role) {
  return actorRole ? actorTypeForRole(actorRole) : undefined;
}

function assertManagementEnabled(config: { managementEnabled: boolean }) {
  if (!config.managementEnabled) {
    throw new UnprocessableEntityError('Prescription management is currently disabled');
  }
}

// --- Upload (Part 9/10/11/48/49) ---

/**
 * Step 1 of the S3 upload flow (Part 10/11): validates the file BEFORE any
 * bytes move, issues a short-lived presigned PUT URL scoped to a
 * deterministic per-prescription object key. Falls back to signalling the
 * (unchanged, still-working) legacy Cloudinary direct-upload path when S3
 * isn't configured — same self-disabling pattern as every other S3
 * integration in this project (Part 54).
 */
export async function getPrescriptionUploadUrl(
  userId: string,
  input: { fileName: string; mimeType: string; fileSize: number },
) {
  const config = await getPrescriptionConfig();
  assertManagementEnabled(config);
  if (!config.uploadEnabled) {
    throw new UnprocessableEntityError('Prescription upload is currently disabled');
  }

  if (!(await isS3Configured())) {
    return { s3Configured: false as const };
  }

  assertValidPrescriptionFile(input);

  const prescriptionId = new mongoose.Types.ObjectId();
  const objectKey = buildPrescriptionObjectKey({
    customerId: userId,
    prescriptionId: String(prescriptionId),
    fileName: input.fileName,
  });
  const uploadUrl = await getPresignedUploadUrl(objectKey, input.mimeType);

  return { s3Configured: true as const, prescriptionId: String(prescriptionId), objectKey, uploadUrl };
}

interface ConfirmUploadInput {
  // Legacy Cloudinary path (unchanged, Part 54).
  cloudinaryPublicId?: string;
  // New S3 path (Part 10/11) — objectKey/prescriptionId came from getPrescriptionUploadUrl above.
  prescriptionId?: string;
  objectKey?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  // Common.
  orderId?: string | null;
  orderItemIds?: string[];
}

/**
 * Part 49 — idempotent: if `prescriptionId` was already confirmed (a
 * retried confirm call after a flaky network response), the existing record
 * is returned rather than a duplicate being created.
 */
export async function confirmPrescriptionUpload(userId: string, input: ConfirmUploadInput) {
  const config = await getPrescriptionConfig();
  assertManagementEnabled(config);
  if (!config.uploadEnabled) {
    throw new UnprocessableEntityError('Prescription upload is currently disabled');
  }

  if (input.prescriptionId) {
    // S3 path.
    const existing = await PrescriptionUploadModel.findById(input.prescriptionId);
    if (existing) return existing; // idempotent retry.

    if (!input.objectKey || !input.fileName || !input.mimeType || !input.fileSize) {
      throw new UnprocessableEntityError('Missing upload metadata');
    }
    assertValidPrescriptionFile({
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
    });

    // Defense against a client claiming an upload happened that never did —
    // confirm the object is actually present in the bucket first.
    const exists = await objectExists(input.objectKey);
    if (!exists) {
      throw new UnprocessableEntityError('Uploaded file was not found in storage — please retry the upload');
    }

    const uploaded = await PrescriptionUploadModel.create({
      _id: new mongoose.Types.ObjectId(input.prescriptionId),
      userId,
      orderId: input.orderId ?? null,
      orderItemIds: input.orderItemIds ?? [],
      storageProvider: STORAGE_PROVIDERS.S3,
      objectKey: input.objectKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      documentStatus: DOCUMENT_STATUS.AVAILABLE,
      createdBy: userId,
    });

    await upsertDocumentRecord({
      entityType: DOCUMENT_TYPES.PRESCRIPTION,
      entityId: String(uploaded._id),
      sellerId: null,
      documentType: DOCUMENT_TYPES.PRESCRIPTION,
      storageProvider: STORAGE_PROVIDERS.S3,
      bucket: '',
      objectKey: input.objectKey,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
    });

    await recordAudit({
      actorId: userId,
      action: PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_UPLOADED,
      resource: 'prescription',
      resourceId: String(uploaded._id),
      after: { orderId: input.orderId ?? null, storageProvider: STORAGE_PROVIDERS.S3 },
    });

    await notifyPrescriptionUploaded(userId, String(uploaded._id), uploaded.orderId, config.verificationEnabled);

    return uploaded;
  }

  // Legacy Cloudinary path — unchanged behavior (Part 54).
  if (!input.cloudinaryPublicId) {
    throw new UnprocessableEntityError('Missing upload reference');
  }
  const uploaded = await PrescriptionUploadModel.create({
    userId,
    orderId: input.orderId ?? null,
    orderItemIds: input.orderItemIds ?? [],
    cloudinaryPublicId: input.cloudinaryPublicId,
    storageProvider: STORAGE_PROVIDERS.CLOUDINARY,
    createdBy: userId,
  });

  await recordAudit({
    actorId: userId,
    action: PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_UPLOADED,
    resource: 'prescription',
    resourceId: String(uploaded._id),
    after: { orderId: input.orderId ?? null, storageProvider: STORAGE_PROVIDERS.CLOUDINARY },
  });

  await notifyPrescriptionUploaded(userId, String(uploaded._id), uploaded.orderId, config.verificationEnabled);

  return uploaded;
}

/**
 * Part 11/12/52 — a customer receipt ("we received your prescription") plus,
 * when verification is actually enabled, an admin "pending review" alert
 * (Part 12's explicit example). Skipped entirely when verification is off —
 * nothing to review, so no admin alert would make sense.
 */
async function notifyPrescriptionUploaded(
  userId: string,
  prescriptionId: string,
  orderId: unknown,
  verificationEnabled: boolean,
): Promise<void> {
  const orderIdStr = orderId ? String(orderId) : null;
  await notifyPrescriptionEvent(userId, 'prescription_uploaded', orderIdStr);

  if (verificationEnabled) {
    const customer = await UserModel.findById(userId).select('name').lean();
    await notifyAdmins({
      templateKey: 'prescription_pending_review_admin',
      orderId: orderIdStr ?? undefined,
      data: { customerName: customer?.name ?? 'A customer', prescriptionId },
    });
  }
}

// --- Listing ---

export function listMyPrescriptions(userId: string) {
  return PrescriptionUploadModel.find({ userId }).sort({ createdAt: -1 }).lean();
}

/** Part 19 — reusable prescriptions: the customer's own, currently APPROVED and unexpired uploads. */
export async function listReusablePrescriptions(userId: string) {
  const config = await getPrescriptionConfig();
  if (!config.managementEnabled || !config.reuseEnabled) return [];

  const now = new Date();
  return PrescriptionUploadModel.find({
    userId,
    status: PRESCRIPTION_STATUS.APPROVED,
    $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }],
  })
    .sort({ verifiedAt: -1 })
    .lean();
}

/** Legacy — kept for backward compatibility with the pre-existing `/pending` endpoint. */
export function listPendingPrescriptions(query: ListQuery) {
  const filter = { ...query.filter, status: PRESCRIPTION_STATUS.PENDING };
  return PrescriptionUploadModel.find(filter)
    .sort({ createdAt: 1 })
    .skip((query.page - 1) * query.limit)
    .limit(query.limit)
    .lean();
}

/** Part 21 — the new, fully-filterable admin list (status/customer/order/date), following the same pattern as admin/invoices.service.ts's listInvoicesAdmin. */
export function listPrescriptionsAdmin(query: ListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;

  const { dateFrom, dateTo, ...rest } = query.filter ?? {};
  const filter: Record<string, unknown> = { ...rest };
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = new Date(dateFrom);
    if (dateTo) createdAt.$lte = new Date(dateTo);
    filter.createdAt = createdAt;
  }

  return Promise.all([
    PrescriptionUploadModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    PrescriptionUploadModel.countDocuments(filter),
  ]).then(([items, total]) => ({
    items,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  }));
}

// --- Detail / secure access (Part 22/23/24/25) ---

/** Resolves an actually-fetchable link — presigned S3 (short-lived) or Cloudinary signed-delivery, never a stored public URL. */
async function resolveDownloadUrl(prescription: Pick<PrescriptionUploadDocument, 'storageProvider' | 'objectKey' | 'cloudinaryPublicId'>): Promise<string | null> {
  if (prescription.storageProvider === STORAGE_PROVIDERS.S3 && prescription.objectKey) {
    return getPresignedDownloadUrl(prescription.objectKey);
  }
  if (prescription.cloudinaryPublicId) {
    return getSignedDeliveryUrl(prescription.cloudinaryPublicId);
  }
  return null;
}

export async function getPrescriptionById(
  id: string,
  requester: { id: string; role: string },
) {
  const isStaff = requester.role !== 'customer';
  const prescription = await PrescriptionUploadModel.findById(id).lean();
  if (!prescription) throw new NotFoundError('Prescription');
  // Part 24 — ownership check from AUTHENTICATED identity, never a
  // frontend-supplied customerId.
  if (!isStaff && String(prescription.userId) !== requester.id) {
    throw new ForbiddenError('You cannot view this prescription');
  }

  const signedUrl = await resolveDownloadUrl(prescription);

  await recordAudit({
    actorId: requester.id,
    actorType: isStaff ? actorTypeForRole(requester.role as Role) : undefined,
    action: PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_VIEWED,
    resource: 'prescription',
    resourceId: id,
  });

  return { ...prescription, signedUrl };
}

// --- Review workflow (Part 13/26/27/50) ---

async function transitionPrescription(
  id: string,
  to: PrescriptionStatus,
  actorId: string,
  extra: Record<string, unknown> = {},
) {
  const doc = await PrescriptionUploadModel.findById(id);
  if (!doc) throw new NotFoundError('Prescription');
  const allowed = PRESCRIPTION_STATUS_TRANSITIONS[doc.status as PrescriptionStatus] ?? [];
  if (!allowed.includes(to)) {
    throw new UnprocessableEntityError(`Cannot move prescription from "${doc.status}" to "${to}"`);
  }
  doc.set('status', to);
  for (const [key, value] of Object.entries(extra)) doc.set(key, value);
  doc.set('updatedBy', actorId);
  await doc.save();
  return doc;
}

/**
 * Part 17/RX-01-UI — approving a prescription that's linked to an order sets
 * `order.prescriptionVerified = true`, the exact wire-up RX-01 documents as
 * missing. Idempotent state guard (Part 50) via transitionPrescription's
 * PENDING-only precondition — two Admins racing to approve the same
 * prescription: the loser's `findById`+`save` still succeeds at the Mongoose
 * level, but the STATE GUARD only allows PENDING->APPROVED once meaningfully
 * (a second approve on an already-APPROVED doc is rejected by the
 * transition table, since `approved` has no `approved` self-transition).
 */
export async function approvePrescription(id: string, actorId: string, actorRole?: Role) {
  const config = await getPrescriptionConfig();
  assertManagementEnabled(config);

  const expiryDate =
    config.validityEnabled ? new Date(Date.now() + config.validityDays * 24 * 60 * 60 * 1000) : null;

  const doc = await transitionPrescription(id, PRESCRIPTION_STATUS.APPROVED, actorId, {
    verifiedBy: actorId,
    verifiedAt: new Date(),
    expiryDate,
  });

  await recordAudit({
    actorId,
    actorType: resolveActorType(actorRole),
    action: PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_VERIFIED,
    resource: 'prescription',
    resourceId: String(doc._id),
    after: { expiryDate },
  });

  if (doc.orderId) {
    await OrderModel.updateOne({ _id: doc.orderId }, { prescriptionVerified: true });
    await recordAudit({
      actorId,
      actorType: resolveActorType(actorRole),
      action: PRESCRIPTION_AUDIT_ACTIONS.ORDER_PRESCRIPTION_VERIFIED,
      resource: 'order',
      resourceId: String(doc.orderId),
      metadata: { prescriptionId: String(doc._id) },
    });
  }

  await notifyPrescriptionEvent(String(doc.userId), 'prescription_approved', doc.orderId ? String(doc.orderId) : null, {
    expiryDate: expiryDate ? expiryDate.toDateString() : 'No expiry',
  });

  return doc;
}

export async function rejectPrescription(id: string, reason: string, actorId: string, actorRole?: Role) {
  const config = await getPrescriptionConfig();
  assertManagementEnabled(config);

  const doc = await transitionPrescription(id, PRESCRIPTION_STATUS.REJECTED, actorId, {
    rejectionReason: reason,
    verifiedBy: actorId,
    verifiedAt: new Date(),
  });

  await recordAudit({
    actorId,
    actorType: resolveActorType(actorRole),
    action: PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_REJECTED,
    resource: 'prescription',
    resourceId: String(doc._id),
    metadata: { reason },
  });

  // Part 11/36 — safe status information only, never anything about the
  // document's contents (the template is admin-authored and whitelisted to
  // only ever reference `customerName`/`orderNumber`/`reason` for this key —
  // see notification-template-variables.util.ts).
  await notifyPrescriptionEvent(String(doc.userId), 'prescription_rejected', doc.orderId ? String(doc.orderId) : null, {
    reason,
  });

  return doc;
}

/** Part 13 — customer withdraws an upload before it's been reviewed. */
export async function cancelPrescription(id: string, userId: string) {
  const doc = await PrescriptionUploadModel.findOne({ _id: id, userId });
  if (!doc) throw new NotFoundError('Prescription');
  const allowed = PRESCRIPTION_STATUS_TRANSITIONS[doc.status as PrescriptionStatus] ?? [];
  if (!allowed.includes(PRESCRIPTION_STATUS.CANCELLED)) {
    throw new UnprocessableEntityError(`Cannot cancel a prescription in "${doc.status}" status`);
  }
  doc.set('status', PRESCRIPTION_STATUS.CANCELLED);
  doc.set('updatedBy', userId);
  await doc.save();

  await recordAudit({
    actorId: userId,
    action: PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_CANCELLED,
    resource: 'prescription',
    resourceId: String(doc._id),
  });

  return doc;
}

/**
 * Part 28/29 — re-upload after rejection. Creates a brand-new row (new
 * version, `previousVersionId` pointing at the rejected one) — the rejected
 * document is NEVER mutated/overwritten, so the full history stays
 * queryable (`PrescriptionUploadModel.find({ previousVersionId: ... })`).
 */
export async function reuploadPrescription(
  id: string,
  userId: string,
  input: ConfirmUploadInput,
) {
  const previous = await PrescriptionUploadModel.findOne({ _id: id, userId });
  if (!previous) throw new NotFoundError('Prescription');
  if (previous.status !== PRESCRIPTION_STATUS.REJECTED) {
    throw new UnprocessableEntityError('Only a rejected prescription can be re-uploaded');
  }

  const created = await confirmPrescriptionUpload(userId, {
    ...input,
    orderId: input.orderId ?? previous.orderId ? String(previous.orderId) : undefined,
    orderItemIds: input.orderItemIds ?? previous.orderItemIds?.map(String),
  });

  await PrescriptionUploadModel.updateOne(
    { _id: created._id },
    { revisionNumber: (previous.revisionNumber ?? 1) + 1, previousVersionId: previous._id },
  );

  await recordAudit({
    actorId: userId,
    action: PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_REUPLOADED,
    resource: 'prescription',
    resourceId: String(created._id),
    metadata: { previousVersionId: String(previous._id) },
  });

  return PrescriptionUploadModel.findById(created._id).lean();
}

// --- Expiry sweep (Part 20) — background job, mirrors log-retention.worker.ts's pattern ---

/** SYSTEM/BACKGROUND_JOB actor context (Part 36) — never attributed to a human admin. */
export async function runPrescriptionExpirySweepJob(): Promise<number> {
  const config = await getPrescriptionConfig();
  if (!config.managementEnabled || !config.validityEnabled) return 0;

  const now = new Date();
  const expired = await PrescriptionUploadModel.find({
    status: PRESCRIPTION_STATUS.APPROVED,
    expiryDate: { $ne: null, $lte: now },
  }).select('_id');

  if (expired.length === 0) return 0;

  await PrescriptionUploadModel.updateMany(
    { _id: { $in: expired.map((d) => d._id) } },
    { status: PRESCRIPTION_STATUS.EXPIRED },
  );

  for (const doc of expired) {
    await recordAudit({
      actorId: null,
      actorType: ACTOR_TYPES.BACKGROUND_JOB,
      action: PRESCRIPTION_AUDIT_ACTIONS.PRESCRIPTION_EXPIRED,
      resource: 'prescription',
      resourceId: String(doc._id),
    });
  }

  return expired.length;
}
