import { AsyncLocalStorage } from 'node:async_hooks';

import { ACTOR_TYPES } from '@medcommerce/shared';

import { env } from './env';

/**
 * Prompt 18 Part 4/5/30/31/32 — the single mechanism that lets a `requestId`
 * (and actor/tenant/job identity) reach EVERY log line emitted while
 * handling a request or background job, without threading a `requestId`
 * parameter through every service function signature across the whole
 * codebase (which would touch hundreds of call sites and violate the
 * "extend, don't rebuild" rule).
 *
 * Node's AsyncLocalStorage preserves the SAME store object across
 * `await`s within one logical call chain — a request handler calling
 * `orderService.checkout()` calling `paymentService...` calling
 * `logger.info(...)` all see the same store, because they're all
 * descendants of the same `als.run()` call, even though each hop is
 * asynchronous. `config/logger.ts` reads this via a pino `mixin()` so
 * every `logger.info/warn/error()` call anywhere in the app automatically
 * gets `requestId`/`tenant`/`actorId`/`actorType`/`role` merged in — no
 * call site needs to change.
 */
export interface RequestLogContext {
  /** Correlates every log line for one HTTP request, or one background job execution (Part 30/31). */
  requestId: string;
  /** Part 5 — fixed per-deployment today (TENANT_CODE env var); never taken from request input. */
  tenant: string;
  /** Set once auth middleware resolves the caller (Part 32); undefined for anonymous requests. */
  actorId?: string | null;
  /** 'user' | 'SYSTEM' | 'BACKGROUND_JOB' — background jobs must never claim to be a human actor (Part 31). */
  actorType?: string;
  role?: string;
  /** Present only inside a background-job execution context (Part 31). */
  jobId?: string;
  jobName?: string;
}

const storage = new AsyncLocalStorage<RequestLogContext>();

/** Runs `fn` with `context` active for its entire (sync + async) call tree. */
export function runWithRequestContext<T>(context: RequestLogContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Returns the active context, or `undefined` outside of any request/job scope (e.g. at module load, or in a unit test). */
export function getRequestContext(): RequestLogContext | undefined {
  return storage.getStore();
}

/**
 * Mutates fields on the CURRENTLY active context in place (e.g. once
 * `requireAuth` decodes a JWT partway through a request that already has a
 * `requestId`). A no-op outside of an active context — callable from code
 * paths that may or may not be running inside one (e.g. shared auth
 * middleware also used by tests that don't set up request-context).
 */
export function updateRequestContext(patch: Partial<RequestLogContext>): void {
  const current = storage.getStore();
  if (!current) return;
  Object.assign(current, patch);
}

/**
 * Prompt 18 Part 30/31/32 — the one helper every BullMQ worker processor
 * (invoice/notification/shipment/maintenance) wraps its handler in, so
 * every log line a background job produces — including everything it
 * calls transitively (payment/inventory/shipment/audit/StorageService) —
 * is correlated by `jobId` and clearly identifies itself as
 * `ACTOR_TYPES.BACKGROUND_JOB`, never a human actor.
 */
export function runWithJobContext<T>(jobName: string, jobId: string | number | undefined, fn: () => T): T {
  return runWithRequestContext(
    {
      requestId: `job-${jobName}-${jobId ?? 'unknown'}`,
      tenant: env.TENANT_CODE,
      actorType: ACTOR_TYPES.BACKGROUND_JOB,
      jobId: String(jobId ?? 'unknown'),
      jobName,
    },
    fn,
  );
}
