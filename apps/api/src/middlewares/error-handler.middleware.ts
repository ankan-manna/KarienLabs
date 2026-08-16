import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';

import { isProduction } from '../config/env';
import { logger } from '../config/logger';
import { AppError } from '../utils/app-error';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Cannot ${req.method} ${req.originalUrl}`));
}

/** Narrow check for Mongoose/MongoDB duplicate-key errors without importing the driver's error class directly. */
function isDuplicateKeyError(
  err: Error,
): err is Error & { code: number; keyValue?: Record<string, unknown> } {
  return (err as { code?: number }).code === 11000;
}

/**
 * Bugfix (Human-Readable API Logging) Part 7 — Mongoose's own error classes
 * (ValidationError, CastError, VersionError, ...) are real `Error`s but not
 * `AppError`s, so they previously fell into the generic 500
 * "INTERNAL_SERVER_ERROR"/"Unexpected error" bucket — indistinguishable from
 * a genuine application bug. Tagging them `DATABASE_ERROR` gives this
 * category (explicitly required alongside USER/VALIDATION, EXTERNAL SERVICE,
 * PAYMENT, INVENTORY) real substance without inventing a second error-class
 * hierarchy — `mongoose.Error` is the existing, shared base class every one
 * of these already extends.
 */
function isMongooseError(err: Error): boolean {
  return err instanceof mongoose.Error;
}

/**
 * Bugfix (Human-Readable API Logging) Part 2/3/11/20 — read by pino-http's
 * `customProps` (app.ts) so these fields merge directly into the SAME
 * "request completed" line pino-http already auto-generates for every
 * request, instead of living in a second, disconnected log line a developer
 * has to manually cross-reference by requestId. Deliberately NOT the raw
 * response body — `sendSuccess`/this handler populate only these specific,
 * pre-known-safe fields (Part 3: "do not blindly stringify every response
 * body").
 */
export interface RequestLogOutcome {
  outcome: 'success' | 'error';
  errorCode?: string;
  message?: string;
  cause?: string;
  integration?: string;
  operation?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      logOutcome?: RequestLogOutcome;
    }
  }
}

function setLogOutcome(res: Response, outcome: RequestLogOutcome): void {
  res.locals.logOutcome = outcome;
}

/**
 * Part 6/20 — the detailed, ERROR-level "API request failed" log line,
 * always emitted alongside (before) the request-completion line, carrying
 * everything a developer needs WITHOUT opening the source: method/url/
 * statusCode/errorCode/message, plus whatever safe `logContext` the error
 * was thrown with (cause/integration/operation/business ids — Part 8/9/12).
 * Non-operational AppErrors (a bug, not an expected business-rule
 * rejection) log the full `err` object (stack included) for server-side
 * diagnosis; operational ones log a concise summary — same severity split
 * the codebase already used, just enriched with the missing context fields.
 */
function logHandledError(
  req: Request,
  fields: {
    statusCode: number;
    errorCode: string;
    message: string;
    cause?: string;
    integration?: string;
    operation?: string;
    [key: string]: unknown;
  },
  err: Error,
  isOperational: boolean,
) {
  const base = {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    ...fields,
  };
  if (!isOperational) {
    logger.error({ ...base, err }, 'API request failed');
  } else if (fields.statusCode >= 500) {
    logger.error(base, 'API request failed');
  } else {
    logger.warn(base, 'API request failed');
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  if (isDuplicateKeyError(err)) {
    const field = err.keyValue ? Object.keys(err.keyValue)[0] : 'field';
    const value = err.keyValue?.[field];
    const message = `A record with ${field} "${String(value)}" already exists`;
    logHandledError(
      req,
      {
        statusCode: 409,
        errorCode: 'CONFLICT',
        message,
        cause: 'Duplicate key constraint violated',
        integration: 'database',
      },
      err,
      true,
    );
    setLogOutcome(res, {
      outcome: 'error',
      errorCode: 'CONFLICT',
      message,
      cause: 'Duplicate key constraint violated',
      integration: 'database',
    });
    return res.status(409).json({
      success: false,
      data: null,
      error: { code: 'CONFLICT', message },
    });
  }

  if (err instanceof AppError) {
    const logContext = err.logContext ?? {};
    logHandledError(
      req,
      { statusCode: err.statusCode, errorCode: err.code, message: err.message, ...logContext },
      err,
      err.isOperational,
    );
    setLogOutcome(res, {
      outcome: 'error',
      errorCode: err.code,
      message: err.message,
      cause: typeof logContext.cause === 'string' ? logContext.cause : undefined,
      integration: typeof logContext.integration === 'string' ? logContext.integration : undefined,
      operation: typeof logContext.operation === 'string' ? logContext.operation : undefined,
    });

    return res.status(err.statusCode).json({
      success: false,
      data: null,
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (isMongooseError(err)) {
    const message = isProduction ? 'A database error occurred. Please try again.' : err.message;
    logHandledError(
      req,
      { statusCode: 500, errorCode: 'DATABASE_ERROR', message: err.message, integration: 'database' },
      err,
      false,
    );
    setLogOutcome(res, { outcome: 'error', errorCode: 'DATABASE_ERROR', message, integration: 'database' });
    return res.status(500).json({
      success: false,
      data: null,
      error: { code: 'DATABASE_ERROR', message },
    });
  }

  const message = isProduction ? 'Something went wrong. Please try again.' : err.message;
  logHandledError(
    req,
    { statusCode: 500, errorCode: 'INTERNAL_SERVER_ERROR', message: err.message },
    err,
    false,
  );
  setLogOutcome(res, { outcome: 'error', errorCode: 'INTERNAL_SERVER_ERROR', message });

  return res.status(500).json({
    success: false,
    data: null,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message,
    },
  });
}
