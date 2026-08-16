/**
 * Bugfix (Human-Readable API Logging) Part 6/8/9/12/20 — diagnostic context
 * for the SERVER-SIDE log line only. Never serialized into the JSON response
 * sent to the client (error-handler.middleware.ts reads `code`/`message`/
 * `details` for the response body, `logContext` separately for the log call
 * only) — this is exactly what lets a customer-safe message like "Delivery
 * availability could not be verified right now" coexist with a precise,
 * internal `cause: "External Shiprocket authentication failed"` /
 * `integration: "shiprocket"` / `operation: "authenticate"` in the log,
 * without ever leaking the latter to the client (Part 18: "Do NOT expose...
 * internal infrastructure details").
 */
export interface AppErrorLogContext {
  /** Short, human-readable technical explanation of what actually happened — for developers reading logs, never the customer. */
  cause?: string;
  /** External integration involved, e.g. 'shiprocket' | 'razorpay' | 'cloudinary' | 's3' | 'database'. */
  integration?: string;
  /** The specific operation that failed, e.g. 'authenticate' | 'check_serviceability' | 'create_order'. */
  operation?: string;
  /** Safe business identifiers (orderId, productId, batchId, ...) — never full documents (Part 12). */
  [key: string]: unknown;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly details?: unknown;
  public readonly logContext?: AppErrorLogContext;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
    logContext?: AppErrorLogContext,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    this.details = details;
    this.logContext = logContext;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, 'FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(409, 'CONFLICT', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests') {
    super(429, 'RATE_LIMITED', message);
  }
}

/**
 * For valid, well-formed requests that violate a business rule (insufficient
 * stock, expired coupon, ...) — distinct from ValidationError's malformed-
 * input case. `code`/`logContext` are optional overrides (default matches
 * every existing call site's behavior unchanged) so a specific cause — e.g.
 * `SHIPROCKET_AUTHENTICATION_FAILED` vs `PINCODE_NOT_SERVICEABLE`, both
 * otherwise identical 422s — can be distinguished in the response's
 * `error.code` and in logs (Part 7/8), without inventing a parallel error
 * class hierarchy for every external-service failure mode.
 */
export class UnprocessableEntityError extends AppError {
  constructor(
    message: string,
    details?: unknown,
    code = 'UNPROCESSABLE_ENTITY',
    logContext?: AppErrorLogContext,
  ) {
    super(422, code, message, details, logContext);
  }
}
