/** India NDPS/D&C Act drug schedules — governs prescription requirements and sale restrictions. */
export const DRUG_SCHEDULES = {
  NONE: 'none',
  SCHEDULE_G: 'schedule_g',
  SCHEDULE_H: 'schedule_h',
  SCHEDULE_H1: 'schedule_h1',
  SCHEDULE_X: 'schedule_x',
} as const;

export type DrugSchedule = (typeof DRUG_SCHEDULES)[keyof typeof DRUG_SCHEDULES];

export const PRESCRIPTION_REQUIRED_SCHEDULES: DrugSchedule[] = [
  DRUG_SCHEDULES.SCHEDULE_H,
  DRUG_SCHEDULES.SCHEDULE_H1,
  DRUG_SCHEDULES.SCHEDULE_X,
];

/**
 * Prompt 17 — extends the pre-existing PENDING/APPROVED/REJECTED machine
 * (real data already depends on these three — never rename/remove them)
 * with EXPIRED (Part 20 — a verified prescription past its validity window)
 * and CANCELLED (Part 13 — customer/admin withdraws an upload before
 * review). "PENDING" already covers the generic prompt template's
 * UPLOADED/PENDING_REVIEW/UNDER_REVIEW distinction (Part 13 explicitly says
 * to prefer existing naming conventions where one is already present).
 */
export const PRESCRIPTION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
} as const;

export type PrescriptionStatus = (typeof PRESCRIPTION_STATUS)[keyof typeof PRESCRIPTION_STATUS];

/** Part 26/50 — the one authoritative state machine; prescription.service.ts's transition guard rejects anything not listed here. */
export const PRESCRIPTION_STATUS_TRANSITIONS: Record<PrescriptionStatus, PrescriptionStatus[]> = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['expired'], // an approved/verified prescription can only ever lapse with age, never be silently un-approved.
  rejected: [], // Part 28 — re-upload creates a NEW PrescriptionUpload version, it never resurrects the rejected one.
  expired: [],
  cancelled: [],
};
