import type { Response } from 'express';

interface Meta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export function sendSuccess<T>(res: Response, data: T, statusCode = 200, meta: Meta | null = null) {
  // Bugfix (Human-Readable API Logging) Part 3 — read by pino-http's
  // `customProps` (app.ts) so the auto-generated "request completed" log
  // line shows `outcome: success` without dumping the actual payload (which
  // can be a whole product/order document, a paginated list, ...).
  res.locals.logOutcome = { outcome: 'success' };
  return res.status(statusCode).json({
    success: true,
    data,
    meta,
    error: null,
  });
}

export function sendCreated<T>(res: Response, data: T) {
  return sendSuccess(res, data, 201);
}

export function sendPaginated<T>(res: Response, items: T[], meta: Required<Meta>) {
  return sendSuccess(res, items, 200, meta);
}
