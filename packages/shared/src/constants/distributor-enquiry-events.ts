/**
 * Prompt 32 — Distributor / Bulk Purchase enquiry workflow (a lead/enquiry
 * domain, deliberately separate from ORDER_STATUS/RETURN_STATUS — an
 * enquiry is a business communication record, never an order). Mirrors
 * RETURN_STATUS/RETURN_STATUS_TRANSITIONS' exact shape (commerce.ts) — same
 * transition-guard pattern, applied to a new, unrelated status machine.
 */
export const DISTRIBUTOR_ENQUIRY_STATUS = {
  NEW: 'new',
  IN_REVIEW: 'in_review',
  CONTACTED: 'contacted',
  NEGOTIATING: 'negotiating',
  QUOTED: 'quoted',
  CONVERTED: 'converted',
  CLOSED: 'closed',
  REJECTED: 'rejected',
} as const;

export type DistributorEnquiryStatus =
  (typeof DISTRIBUTOR_ENQUIRY_STATUS)[keyof typeof DISTRIBUTOR_ENQUIRY_STATUS];

/**
 * NEW is the only entry point; REJECTED/CLOSED/CONVERTED are terminal (no
 * outgoing transitions) — an admin who wants to resume a closed enquiry
 * creates a fresh one rather than reopening history (Part 25: "do not allow
 * completely arbitrary state manipulation").
 */
export const DISTRIBUTOR_ENQUIRY_STATUS_TRANSITIONS: Record<
  DistributorEnquiryStatus,
  DistributorEnquiryStatus[]
> = {
  new: ['in_review', 'rejected', 'closed'],
  in_review: ['contacted', 'rejected', 'closed'],
  contacted: ['negotiating', 'quoted', 'rejected', 'closed'],
  negotiating: ['quoted', 'contacted', 'rejected', 'closed'],
  quoted: ['negotiating', 'converted', 'rejected', 'closed'],
  converted: [],
  closed: [],
  rejected: [],
};

export const DISTRIBUTOR_ENQUIRY_AUDIT_ACTIONS = {
  ENQUIRY_CREATED: 'DISTRIBUTOR_ENQUIRY_CREATED',
  ENQUIRY_STATUS_CHANGED: 'DISTRIBUTOR_ENQUIRY_STATUS_CHANGED',
  ENQUIRY_ASSIGNED: 'DISTRIBUTOR_ENQUIRY_ASSIGNED',
  ENQUIRY_NOTE_ADDED: 'DISTRIBUTOR_ENQUIRY_NOTE_ADDED',
} as const;
export type DistributorEnquiryAuditAction =
  (typeof DISTRIBUTOR_ENQUIRY_AUDIT_ACTIONS)[keyof typeof DISTRIBUTOR_ENQUIRY_AUDIT_ACTIONS];

/** Notification event keys (enqueueNotification's templateKey) — the EXISTING notification architecture, not a new provider. */
export const DISTRIBUTOR_ENQUIRY_NOTIFICATION_EVENTS = {
  NEW_ENQUIRY_ADMIN: 'distributor_enquiry_new',
  ENQUIRY_CONFIRMATION: 'distributor_enquiry_confirmation',
} as const;
