import type {
  ActorType,
  AnalyticsAuditAction,
  AuthAction,
  AuthMethod,
  AuthResult,
  CatalogAuditAction,
  CouponAuditAction,
  CustomerAuditAction,
  DistributorEnquiryAuditAction,
  FulfillmentAuditAction,
  InvoiceAuditAction,
  NotificationAuditAction,
  PrescriptionAuditAction,
  ReturnAuditAction,
  SeoAuditAction,
  ShipmentAuditAction,
  StorageAuditAction,
} from '@medcommerce/shared';

import { sanitizeForLogging } from '../../utils/log-sanitizer';

import { AuditLogModel } from './models/audit-log.model';

interface RecordAuditInput {
  actorId?: string | null;
  action:
    | 'create'
    | 'update'
    | 'delete'
    | 'login'
    | 'logout'
    | 'config_change'
    | 'export'
    | 'import'
    | AuthAction
    | CatalogAuditAction
    | InvoiceAuditAction
    | ShipmentAuditAction
    | StorageAuditAction
    | ReturnAuditAction
    | PrescriptionAuditAction
    | CouponAuditAction
    | NotificationAuditAction
    | CustomerAuditAction
    | AnalyticsAuditAction
    | SeoAuditAction
    | FulfillmentAuditAction
    | DistributorEnquiryAuditAction;
  resource: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string;
  requestId?: string;
  // Actor-context (Prompt 10) — all optional so every pre-Prompt-10 call site
  // (config/role/order/return/... services) is unaffected.
  actorType?: ActorType;
  actorName?: string;
  actorEmail?: string;
  authenticationMethod?: AuthMethod;
  userAgent?: string;
  result?: AuthResult;
  failureReason?: string;
  metadata?: unknown;
}

/**
 * Fire-and-forget audit trail write — called from service-layer mutations
 * on sensitive collections (wired up per-domain from Prompt 3 onward), and
 * from Prompt 10 onward also from authentication events (login/OTP/Google/
 * password-reset).
 *
 * Prompt 24 Part 42/44/64 — `before`/`after`/`metadata` are run through the
 * SAME recursive field-name-based redaction `sanitizeForLogging()` already
 * applies to production logs (Prompt 18), reused here rather than
 * duplicated. This was a genuine gap: audit records previously stored
 * whatever a caller passed verbatim, with zero redaction — most callers
 * only ever pass safe, already-curated summaries (e.g. `{role, isActive}`),
 * but a few pass a raw Configuration document (`configuration.service.ts`),
 * which for the `razorpay`/`cloudinary`/`aws`/`smtp` namespaces can contain
 * third-party secrets. Audit records must be safe to view even by an
 * authorized operator (Part 42's own standard for application logs applies
 * equally here), not just the general application log stream.
 */
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  await AuditLogModel.create({
    actorId: input.actorId ?? null,
    action: input.action,
    resource: input.resource,
    resourceId: input.resourceId ?? null,
    before: sanitizeForLogging(input.before ?? null),
    after: sanitizeForLogging(input.after ?? null),
    ip: input.ip ?? '',
    requestId: input.requestId ?? '',
    actorType: input.actorType ?? null,
    actorName: input.actorName ?? '',
    actorEmail: input.actorEmail ?? '',
    authenticationMethod: input.authenticationMethod ?? '',
    userAgent: input.userAgent ?? '',
    result: input.result ?? '',
    failureReason: input.failureReason ?? '',
    metadata: sanitizeForLogging(input.metadata ?? null),
  });
}
