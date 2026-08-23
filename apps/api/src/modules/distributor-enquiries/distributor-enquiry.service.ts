import {
  DISTRIBUTOR_ENQUIRY_AUDIT_ACTIONS,
  DISTRIBUTOR_ENQUIRY_NOTIFICATION_EVENTS,
  DISTRIBUTOR_ENQUIRY_STATUS,
  DISTRIBUTOR_ENQUIRY_STATUS_TRANSITIONS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CHANNELS,
  ROLES,
  type DistributorEnquiryStatus,
  type Role,
} from '@medcommerce/shared';

import { logger } from '../../config/logger';
import { NotFoundError, UnprocessableEntityError } from '../../utils/app-error';
import type { ListQuery } from '../../utils/pagination';
import { generateSequenceNumber } from '../../utils/sequence.util';
import { recordAudit } from '../audit/audit.service';
import { maskContact } from '../auth/contact.util';
import { signChallengeToken, verifyChallengeToken } from '../auth/jwt.util';
import { UserModel } from '../auth/models/user.model';
import { VERIFICATION_PURPOSES } from '../auth/models/verification-token.model';
import { issueOtp, verifyOtp } from '../auth/otp.service';
import { BundleModel } from '../catalog/models/bundle.model';
import { ProductModel } from '../catalog/models/product.model';
import { enqueueNotification, notifyAdmins } from '../notifications/notification.service';

import { getDistributorEnquiryConfig } from './distributor-enquiry-config.service';
import { DistributorEnquiryModel } from './models/distributor-enquiry.model';

/**
 * a business ENQUIRY/LEAD only. Nothing in this file may ever:
 *   - create an Order, Payment, or Razorpay order
 *   - deduct, reserve, or otherwise touch Inventory/Batch stock
 *   - create a Shiprocket shipment, label, or Invoice
 *   - apply/derive distributor-specific pricing
 * (Part 15-19/26 — see the final report for the isolation verification.)
 */

interface RequestMeta {
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

/** Wraps jsonwebtoken's throw-on-invalid verify so callers get `null` uniformly, same pattern as auth.service.ts's safeVerifyChallengeToken. */
function safeVerifyContactToken(token: string) {
  try {
    return verifyChallengeToken(token, 'distributor_enquiry_contact_verified');
  } catch {
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Guest/authenticated contact-OTP verification (Part 10/11) ---

export async function requestDistributorEnquiryOtp(email: string, meta: RequestMeta) {
  const cfg = await getDistributorEnquiryConfig();
  if (!cfg.enquiryEnabled) {
    throw new UnprocessableEntityError('Distributor/bulk purchase enquiries are currently unavailable.');
  }

  const otp = await issueOtp({
    purpose: VERIFICATION_PURPOSES.DISTRIBUTOR_ENQUIRY_VERIFICATION,
    contact: email,
    channelOverride: NOTIFICATION_CHANNELS.EMAIL,
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });

  return {
    maskedContact: maskContact(email),
    expiresAt: otp.expiresAt,
    resendCooldownSeconds: otp.resendCooldownSeconds,
    devOnlyCode: otp.devOnlyCode,
  };
}

export async function resendDistributorEnquiryOtp(email: string, meta: RequestMeta) {
  const otp = await issueOtp({
    purpose: VERIFICATION_PURPOSES.DISTRIBUTOR_ENQUIRY_VERIFICATION,
    contact: email,
    channelOverride: NOTIFICATION_CHANNELS.EMAIL,
    isResend: true,
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });

  return {
    maskedContact: maskContact(email),
    expiresAt: otp.expiresAt,
    resendCooldownSeconds: otp.resendCooldownSeconds,
    devOnlyCode: otp.devOnlyCode,
  };
}

export async function verifyDistributorEnquiryOtp(email: string, code: string, meta: RequestMeta) {
  await verifyOtp({
    purpose: VERIFICATION_PURPOSES.DISTRIBUTOR_ENQUIRY_VERIFICATION,
    contact: email,
    code,
    ip: meta.ip,
    userAgent: meta.userAgent,
    requestId: meta.requestId,
  });

  const contactVerificationToken = signChallengeToken(email, 'distributor_enquiry_contact_verified');
  return { contactVerificationToken };
}

// --- Enquiry creation (Part 1-19) ---

interface RequestedProductInput {
  productId: string;
  requestedQuantity: number;
}

export interface CreateDistributorEnquiryInput {
  companyName: string;
  contactPerson: string;
  email: string;
  mobile: string;
  gstin?: string;
  businessAddress: string;
  city: string;
  state: string;
  pincode: string;
  message?: string;
  requestedProducts?: RequestedProductInput[];
  contactVerificationToken?: string;
}

/**
 * Part 5/6/37/38 — never trusts a submitted product name/sku/price; resolves
 * each `productId` against the live, currently-active catalog and freezes a
 * name/sku snapshot at THIS moment. An inactive/deleted/nonexistent
 * reference rejects the whole submission (Part 38) rather than silently
 * dropping the line — a distributor should never discover after the fact
 * that half their requested items were quietly ignored.
 *
 * The client only ever submits a `productId` (see distributor-enquiry.
 * validator.ts's doc comment) — combo/bundle SKUs are already unified into
 * the Product collection, so this also transparently covers combo requests;
 * when the resolved product IS a bundle wrapper (`isBundle: true`), the
 * matching Bundle._id is captured too, purely for admin traceability.
 */
async function resolveRequestedProducts(items: RequestedProductInput[]) {
  const resolved: {
    productId: string;
    bundleId: string | null;
    nameSnapshot: string;
    skuSnapshot: string;
    requestedQuantity: number;
  }[] = [];

  for (const item of items) {
    const product = await ProductModel.findOne({
      _id: item.productId,
      isActive: true,
      deletedAt: null,
    })
      .select('name sku isBundle')
      .lean();
    if (!product) throw new NotFoundError('One of the requested products is no longer available');

    let bundleId: string | null = null;
    if (product.isBundle) {
      const bundle = await BundleModel.findOne({
        productId: product._id,
        isActive: true,
        deletedAt: null,
      })
        .select('_id')
        .lean();
      bundleId = bundle ? String(bundle._id) : null;
    }

    resolved.push({
      productId: String(product._id),
      bundleId,
      nameSnapshot: product.name,
      skuSnapshot: product.sku,
      requestedQuantity: item.requestedQuantity,
    });
  }

  return resolved;
}

/**
 * Part 27/28/29 — best-effort notification: a failure here is logged and
 * swallowed, NEVER re-thrown (the enquiry is already durably saved by the
 * time this runs — see createDistributorEnquiry below, which calls this
 * AFTER `DistributorEnquiryModel.create` succeeds).
 */
async function notifyEnquiryCreated(enquiry: {
  _id: unknown;
  enquiryNumber: string;
  companyName: string;
  contactPerson: string;
  email: string;
  mobile: string;
  requestedProducts: { nameSnapshot: string; skuSnapshot: string; requestedQuantity: number }[];
}): Promise<void> {
  try {
    await notifyAdmins({
      templateKey: DISTRIBUTOR_ENQUIRY_NOTIFICATION_EVENTS.NEW_ENQUIRY_ADMIN,
      data: {
        enquiryNumber: enquiry.enquiryNumber,
        companyName: enquiry.companyName,
        contactPerson: enquiry.contactPerson,
        contactEmail: enquiry.email,
        contactMobile: enquiry.mobile,
        productSummary:
          enquiry.requestedProducts
            .map((p) => `${p.nameSnapshot} (${p.skuSnapshot}) x ${p.requestedQuantity}`)
            .join(', ') || 'Not specified',
      },
    });
  } catch (error) {
    logger.warn(
      { error, enquiryId: String(enquiry._id) },
      'Failed to notify admins of new distributor enquiry — enquiry itself is saved',
    );
  }

  try {
    await enqueueNotification({
      channel: 'email',
      templateKey: DISTRIBUTOR_ENQUIRY_NOTIFICATION_EVENTS.ENQUIRY_CONFIRMATION,
      recipient: enquiry.email,
      category: NOTIFICATION_CATEGORIES.SYSTEM,
      data: { companyName: enquiry.companyName, enquiryNumber: enquiry.enquiryNumber },
    });
  } catch (error) {
    logger.warn(
      { error, enquiryId: String(enquiry._id) },
      'Failed to send distributor enquiry confirmation — enquiry itself is saved',
    );
  }
}

export async function createDistributorEnquiry(
  input: CreateDistributorEnquiryInput,
  authenticatedUserId: string | null,
  meta: RequestMeta,
) {
  const cfg = await getDistributorEnquiryConfig();
  if (!cfg.enquiryEnabled) {
    throw new UnprocessableEntityError('Distributor/bulk purchase enquiries are currently unavailable.');
  }

  let contactVerified = false;
  if (cfg.otpRequired) {
    if (!input.contactVerificationToken) {
      throw new UnprocessableEntityError('Please verify your email before submitting your enquiry.');
    }
    const payload = safeVerifyContactToken(input.contactVerificationToken);
    if (!payload || payload.sub.toLowerCase() !== input.email.trim().toLowerCase()) {
      throw new UnprocessableEntityError(
        'Contact verification is invalid, expired, or does not match the email provided. Please verify again.',
      );
    }
    contactVerified = true;
  }

  const requestedProducts = await resolveRequestedProducts(input.requestedProducts ?? []);
  const enquiryNumber = await generateSequenceNumber('distributor_enquiry', 'DBE');

  const enquiry = await DistributorEnquiryModel.create({
    enquiryNumber,
    userId: authenticatedUserId,
    companyName: input.companyName,
    contactPerson: input.contactPerson,
    email: input.email.trim().toLowerCase(),
    mobile: input.mobile,
    gstin: input.gstin ? input.gstin.trim().toUpperCase() : null,
    businessAddress: input.businessAddress,
    city: input.city,
    state: input.state,
    pincode: input.pincode,
    message: input.message ?? '',
    requestedProducts,
    contactVerified,
    status: DISTRIBUTOR_ENQUIRY_STATUS.NEW,
  });

  await recordAudit({
    actorId: authenticatedUserId,
    action: DISTRIBUTOR_ENQUIRY_AUDIT_ACTIONS.ENQUIRY_CREATED,
    resource: 'distributor_enquiry',
    resourceId: String(enquiry._id),
    after: { enquiryNumber, companyName: enquiry.companyName, status: enquiry.status },
    ip: meta.ip,
    requestId: meta.requestId,
  });

  if (cfg.emailNotificationsEnabled) {
    await notifyEnquiryCreated(enquiry);
  }

  return {
    enquiryNumber: enquiry.enquiryNumber,
    status: enquiry.status,
    // `createdAt` is added at runtime by auditPlugin's `schema.set('timestamps', true)`,
    // which InferSchemaType can't see statically (same gap other *.service.ts
    // files work around the same way).
    createdAt: (enquiry as unknown as { createdAt: Date }).createdAt,
  };
}

// --- Customer's own enquiries (authenticated) ---

/** No public "read someone else's enquiry" endpoint exists (Part 32/34) — this is the only customer-facing read, scoped to the authenticated user's own submissions. */
export function listMyDistributorEnquiries(userId: string) {
  return DistributorEnquiryModel.find({ userId })
    .select('-internalNotes')
    .sort({ createdAt: -1 })
    .lean();
}

// --- Admin management (Part 20-25, 40-42, 53-58) ---

export function listDistributorEnquiriesAdmin(query: ListQuery) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 20));
  const skip = (page - 1) * limit;

  const { dateFrom, dateTo, sku, ...rest } = query.filter ?? {};
  const filter: Record<string, unknown> = { ...rest };

  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) createdAt.$gte = new Date(dateFrom);
    if (dateTo) createdAt.$lte = new Date(dateTo);
    filter.createdAt = createdAt;
  }
  if (sku) filter['requestedProducts.skuSnapshot'] = sku;

  if (query.search?.trim()) {
    const term = escapeRegExp(query.search.trim());
    filter.$or = [
      { enquiryNumber: { $regex: term, $options: 'i' } },
      { companyName: { $regex: term, $options: 'i' } },
      { contactPerson: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { mobile: { $regex: term, $options: 'i' } },
    ];
  }

  return Promise.all([
    DistributorEnquiryModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    DistributorEnquiryModel.countDocuments(filter),
  ]).then(([items, total]) => ({
    items,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  }));
}

export async function getDistributorEnquiryAdmin(id: string) {
  const enquiry = await DistributorEnquiryModel.findById(id).lean();
  if (!enquiry) throw new NotFoundError('Distributor enquiry');
  return enquiry;
}

/** Part 25/56 — the one state-transition guard every status change goes through, same pattern as return.service.ts's transitionReturn. */
export async function updateDistributorEnquiryStatus(
  id: string,
  to: DistributorEnquiryStatus,
  actorId: string,
) {
  const enquiry = await DistributorEnquiryModel.findById(id);
  if (!enquiry) throw new NotFoundError('Distributor enquiry');

  const from = enquiry.status as DistributorEnquiryStatus;
  const allowed = DISTRIBUTOR_ENQUIRY_STATUS_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new UnprocessableEntityError(`Cannot move enquiry from "${from}" to "${to}"`);
  }

  enquiry.set('status', to);
  if (to === DISTRIBUTOR_ENQUIRY_STATUS.CONTACTED && !enquiry.contactedAt) {
    enquiry.set('contactedAt', new Date());
  }
  const isTerminal =
    to === DISTRIBUTOR_ENQUIRY_STATUS.CONVERTED ||
    to === DISTRIBUTOR_ENQUIRY_STATUS.CLOSED ||
    to === DISTRIBUTOR_ENQUIRY_STATUS.REJECTED;
  if (isTerminal && !enquiry.resolvedAt) {
    enquiry.set('resolvedAt', new Date());
  }
  enquiry.set('updatedBy', actorId);
  await enquiry.save();

  await recordAudit({
    actorId,
    action: DISTRIBUTOR_ENQUIRY_AUDIT_ACTIONS.ENQUIRY_STATUS_CHANGED,
    resource: 'distributor_enquiry',
    resourceId: id,
    before: { status: from },
    after: { status: to },
  });

  return enquiry.toObject();
}

/** Part 24/57 — target must be an existing, active staff account (admin/inventory_manager/super_admin); a customer or nonexistent id is rejected. */
export async function assignDistributorEnquiry(id: string, targetAdminId: string, actorId: string) {
  const target = await UserModel.findOne({
    _id: targetAdminId,
    isActive: true,
    deletedAt: null,
    role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.INVENTORY_MANAGER] },
  })
    .select('name role')
    .lean();
  if (!target) throw new UnprocessableEntityError('Target user is not an active staff account');

  const enquiry = await DistributorEnquiryModel.findById(id);
  if (!enquiry) throw new NotFoundError('Distributor enquiry');

  const before = enquiry.assignedAdminId ? String(enquiry.assignedAdminId) : null;
  enquiry.set('assignedAdminId', targetAdminId);
  enquiry.set('updatedBy', actorId);
  await enquiry.save();

  await recordAudit({
    actorId,
    action: DISTRIBUTOR_ENQUIRY_AUDIT_ACTIONS.ENQUIRY_ASSIGNED,
    resource: 'distributor_enquiry',
    resourceId: id,
    before: { assignedAdminId: before },
    after: { assignedAdminId: targetAdminId },
  });

  return enquiry.toObject();
}

/** Part 23/58 — internal-only; never returned by any public/customer-facing read (see listMyDistributorEnquiries's `.select('-internalNotes')` and the public create response, which never includes the document at all). */
export async function addDistributorEnquiryNote(id: string, note: string, actorId: string) {
  const enquiry = await DistributorEnquiryModel.findById(id);
  if (!enquiry) throw new NotFoundError('Distributor enquiry');

  // `req.user` (auth.middleware.ts's AuthContext) only carries {id, role} —
  // no display name — so the author's name is resolved here, not passed in.
  const actor = await UserModel.findById(actorId).select('name').lean();
  const authorName = actor?.name ?? 'Admin';

  enquiry.internalNotes.push({ authorId: actorId, authorName, note, createdAt: new Date() } as never);
  enquiry.set('updatedBy', actorId);
  await enquiry.save();

  await recordAudit({
    actorId,
    action: DISTRIBUTOR_ENQUIRY_AUDIT_ACTIONS.ENQUIRY_NOTE_ADDED,
    resource: 'distributor_enquiry',
    resourceId: id,
    // Never duplicate the note text itself into the audit log (Part 42) —
    // only that a note was added, by whom, when.
    after: { noteCount: enquiry.internalNotes.length },
  });

  return enquiry.toObject();
}

/** Part 24 — minimal, scoped list for the assignment dropdown; deliberately NOT the full user-management endpoint (which requires the much broader USERS:UPDATE permission this module's admins may not have). */
export async function listAssignableStaff() {
  return UserModel.find({
    isActive: true,
    deletedAt: null,
    role: { $in: [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.INVENTORY_MANAGER] },
  })
    .select('name email role')
    .sort({ name: 1 })
    .lean();
}

export type { Role };
