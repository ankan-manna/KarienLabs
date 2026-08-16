import { DISTRIBUTOR_ENQUIRY_STATUS } from '@medcommerce/shared';
import { z } from 'zod';

import { gstinSchema, objectIdSchema } from '../../utils/common-schemas';

const otpCodeSchema = z.string().trim().regex(/^\d{4,8}$/, 'Enter the code you received');

export const requestDistributorEnquiryOtpSchema = z.object({
  email: z.string().trim().email(),
});

export const verifyDistributorEnquiryOtpSchema = z.object({
  email: z.string().trim().email(),
  code: otpCodeSchema,
});

/**
 * The client only ever submits a `productId` — this catalog's combo/bundle
 * SKUs are already unified into the Product collection (a Bundle document
 * just wraps one, see bundle.model.ts), so a single public `/products`
 * lookup already covers both cases. The backend resolves whether that
 * product is ALSO a Bundle (and captures the Bundle._id) itself — see
 * distributor-enquiry.service.ts's resolveRequestedProducts — the frontend
 * never needs to know or submit that distinction.
 */
const requestedProductSchema = z.object({
  productId: objectIdSchema,
  requestedQuantity: z.coerce.number().int().min(1).max(1_000_000),
});

/**
 * Part 34 — the public create surface. Deliberately does NOT accept
 * `status`, `assignedAdminId`, `internalNotes`, `userId`, `enquiryNumber`,
 * `contactVerified`, `contactedAt`, or `resolvedAt` — every one of those is
 * backend-managed (see distributor-enquiry.service.ts's
 * createDistributorEnquiry, which derives them itself and never reads them
 * from the request body).
 */
export const createDistributorEnquirySchema = z.object({
  companyName: z.string().trim().min(2).max(200),
  contactPerson: z.string().trim().min(2).max(100),
  email: z.string().trim().email(),
  mobile: z.string().trim().min(6).max(20),
  gstin: gstinSchema.optional(),
  businessAddress: z.string().trim().min(5).max(500),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().trim().min(4).max(10),
  message: z.string().trim().max(4000).optional(),
  requestedProducts: z.array(requestedProductSchema).max(50).optional(),
  // Present only when `distributor_enquiry.otpRequired` is on (Part 10/11) —
  // the service layer, not this schema, decides whether it's mandatory,
  // since that's a runtime Configuration value this validator can't see.
  contactVerificationToken: z.string().min(1).optional(),
});

export const distributorEnquiryStatusUpdateSchema = z.object({
  status: z.enum(Object.values(DISTRIBUTOR_ENQUIRY_STATUS) as [string, ...string[]]),
});

export const distributorEnquiryAssignmentSchema = z.object({
  adminUserId: objectIdSchema,
});

export const distributorEnquiryNoteSchema = z.object({
  note: z.string().trim().min(3).max(2000),
});

export type CreateDistributorEnquiryBody = z.infer<typeof createDistributorEnquirySchema>;
