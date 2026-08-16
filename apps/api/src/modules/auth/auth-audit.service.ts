import { ACTOR_TYPES, AUTH_RESULT, type AuthAction, type AuthMethod, type Role } from '@medcommerce/shared';

import { recordAudit } from '../audit/audit.service';

import { actorTypeForRole } from './actor-context.util';

export interface AuthEventInput {
  action: AuthAction;
  /** null/omitted for events where no user was ever resolved (e.g. login attempt against an unknown email) — recorded as a SYSTEM-attributed row rather than guessing an actor. */
  userId?: string | null;
  role?: Role;
  name?: string;
  email?: string;
  authenticationMethod?: AuthMethod;
  ip?: string;
  userAgent?: string;
  requestId?: string;
  success: boolean;
  failureReason?: string;
  /** Free-form context. Caller is responsible for never putting a password/OTP/token/secret in here — see logger.ts's redact list for defense-in-depth on the pino side, but this is the primary guard. */
  metadata?: Record<string, unknown>;
}

/**
 * Thin, auth-event-specific wrapper around the existing generic `recordAudit`
 * (apps/api/src/modules/audit/audit.service.ts) — resource is always fixed to
 * `'auth'` and the actor-context fields (Prompt 10 Part 4) are derived
 * consistently instead of every call site reimplementing the same mapping.
 * Does NOT introduce a second audit collection.
 */
export async function recordAuthEvent(input: AuthEventInput): Promise<void> {
  await recordAudit({
    actorId: input.userId ?? null,
    action: input.action,
    resource: 'auth',
    resourceId: input.userId ?? null,
    ip: input.ip,
    requestId: input.requestId,
    actorType: input.role ? actorTypeForRole(input.role) : input.userId ? undefined : ACTOR_TYPES.SYSTEM,
    actorName: input.name ?? '',
    actorEmail: input.email ?? '',
    authenticationMethod: input.authenticationMethod,
    userAgent: input.userAgent ?? '',
    result: input.success ? AUTH_RESULT.SUCCESS : AUTH_RESULT.FAILURE,
    failureReason: input.failureReason ?? '',
    metadata: input.metadata ?? null,
  });
}

/** For automated/webhook/background-job auth-adjacent operations (e.g. OTP/token cleanup) — never attributed to a human actor. Mirrors AUDIT-06 in docs/DEVELOPMENT_TASKS.md (Phase 8) for the order-activity case; this is the auth-log equivalent. */
export async function recordSystemAuthEvent(
  action: AuthAction,
  opts: { resourceId?: string | null; metadata?: Record<string, unknown>; requestId?: string } = {},
): Promise<void> {
  await recordAudit({
    actorId: null,
    action,
    resource: 'auth',
    resourceId: opts.resourceId ?? null,
    actorType: ACTOR_TYPES.SYSTEM,
    authenticationMethod: 'SYSTEM',
    result: AUTH_RESULT.SUCCESS,
    metadata: opts.metadata ?? null,
    requestId: opts.requestId,
  });
}
