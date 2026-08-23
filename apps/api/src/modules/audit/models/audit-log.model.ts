import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * System/security-focused audit trail — every create/update/delete/login/logout/
 * config-change on a sensitive collection. Distinct from CustomerActivity (a
 * user-facing feed) and ErrorLog (unhandled failures). Append-only, immutable.
 */
const auditLogSchema = new Schema({
  actorId: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  action: { type: String, required: true }, // 'create' | 'update' | 'delete' | 'login' | 'logout' | 'config_change' | ...AUTH_ACTIONS
  resource: { type: String, required: true, index: true },
  resourceId: { type: Schema.Types.ObjectId, default: null },
  before: { type: Schema.Types.Mixed, default: null },
  after: { type: Schema.Types.Mixed, default: null },
  ip: { type: String, default: '' },
  requestId: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },

  // Actor-context fields (Part 4/5). All optional/defaulted so every
  // pre-existing recordAudit() call site (config/role/order/return/...)
  // keeps working unchanged with these simply left blank —
  // this extends the one existing audit collection rather than adding a
  // parallel "auth events" collection.
  actorType: { type: String, default: null }, // ACTOR_TYPES — CUSTOMER/PLATFORM_ADMIN/SUPER_ADMIN/SELLER/SYSTEM/WEBHOOK/BACKGROUND_JOB
  actorName: { type: String, default: '' },
  actorEmail: { type: String, default: '' },
  authenticationMethod: { type: String, default: '' }, // AUTH_METHODS — PASSWORD/PASSWORD_OTP/GOOGLE_OAUTH/REFRESH_TOKEN/SYSTEM
  userAgent: { type: String, default: '' },
  result: { type: String, default: '' }, // 'success' | 'failure'
  failureReason: { type: String, default: '' },
  metadata: { type: Schema.Types.Mixed, default: null },
});

auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model('AuditLog', auditLogSchema);
